import { assertKeys } from './widget.js';
import { DataSourceWidget } from './datasourcewidget.js';

// TODO: substitute `HTTPDataSourceWidget`
class HTTPDataSourceWidget extends DataSourceWidget {
    
    constructor(ctx) {
        /*
        ctx: base_address, api_slug, object_name, tail [optional]

        The intercom with the backend works with the following conventions:

        OP      VERB    Address

        C       POST    base_address/api_slug/object_name/tail/create
        R       GET     base_address/api_slug/object_name/tail/read
        U       PUT     base_address/api_slug/object_name/tail/update
        D       DELETE  base_address/api_slug/object_name/tail/delete
        
        (where tail is optional)

        C expects a json object without uuid
        
        R returns a json object: {"objects" : list-of-objects}, where "objects" is the name of the objects in plural, i.e.
        if "object_name" is "banana", then R should return {”bananas" : list-of-objects}

        U expects a json object with uuid

        D expects a json objects: {"uuid" : uuid-of-object-to-be-deleted}
        */
        super()
        if (ctx == undefined) {
            throw("HTTPDataSourceWidget missing ctx")
        }
        assertKeys(["base_address", "api_slug", "object_name"], ctx)
        this.ctx = ctx
        this.createState() // although called by "super()" we need to call this again.. (see createState)
    }

    createState() {
        if (this.ctx == undefined) {
            // invoked by the superclass (DataSourceWidget) ctor
            // so "this.ctx" not yet ready
            return
        }
        if (this.ctx.tail != undefined) {
            this.adr=`${this.ctx.base_address}/${this.ctx.api_slug}/${this.ctx.object_name}/${this.ctx.tail}/`
        }
        else {
            this.adr=`${this.ctx.base_address}/${this.ctx.api_slug}/${this.ctx.object_name}/`
        }
        this.object_name_plural = `${this.ctx.object_name}s`
        this.data = []
        this.log(-1, "createState: adr:", this.adr)
        this.declareDatamodels()
    }

    declareDatamodels() {
        throw("Please subclass declareDatamodels")
        /*
        this.datamodel_create
        this.datamodel_read
        this.datamodel_update
        */
    }

    create_slot(datum) { // C
        let res = this.dataCheck(this.datamodel_create, datum)
        if (res.error != null) {
            this.signals.error.emit(`Create: ${res.error}`)
            return
        }
        let datum_ = res.datum
        // create & read with two different http calls
        // could also be done in one call, where the reply
        // is the new data
        // feel free to rewrite :)

        // async into callback-hell:
        this.create(datum_).then( (ok) =>  
        {
            if (!ok) { return }
            this.read().then( (ok) => 
            {
                if (!ok) { return }
                this.signals.data.emit(this.data)
            })
        })
    }

    read_slot() { // R
        this.read().then( (ok) => 
        {
            if (!ok) { return }
            this.signals.data.emit(this.data)
        })
    }

    update_slot(datum) { // U
        this.log(-1, "update_slot", datum)
        if (!datum.hasOwnProperty('uuid')) {
            this.log(0, "update_slot: incoming data missing uuid")
            this.error.emit("Update: missing uuid")
            return
        }
        let res = this.dataCheck(this.datamodel_update, datum)
        if (res.error != null) {
            this.signals.error.emit(`Update: ${res.error}`)
            return
        }
        let datum_ = res.datum
        this.update(datum_).then( (ok) =>
        {
            if (!ok) { return }
            this.read().then( (ok) => 
            {
                if (!ok) { return }
                this.signals.data.emit(this.data)
            })
        })
    }

    delete_slot(uuid) { // D
        this.delete(uuid).then( (ok) =>
        {
            if (!ok) { return }
            this.read().then( (ok) => 
            {
                if (!ok) { return }
                this.signals.data.emit(this.data)
            })
        })
    }

    // HTTP calls
    async create(datum) { // C
        const head = new Headers();
        head.append('Accept', 'application/json');
        head.append('Content-Type', 'application/json');
        const pars = {
            method: 'POST',
            headers: head,
            mode: 'cors',
            cache: 'default',
            body: JSON.stringify(datum)
        };
        const req = 
            new Request(`${this.adr}create`)
        var response
        try {
            response = await fetch(req, pars)
        } catch (error) {
            this.err("create: fetch failed with", error)
            this.signals.error.emit(
                "Error "+String(error)+" for operation create"
            )
            return false
        }
        if (response.ok == false) {
            try {
                var resp = await response.json() // will give resp.detail
            } catch (error) {
                this.err('error detail response is not json')
                resp = {detail: '???'} // create something for resp.detail
            }
            this.err("create: req got error", response.status, resp.detail)
            this.signals.error.emit(
                `Error ${response.status}: "${resp.detail}" from server for operation create`
            )
            return false
        }
        return true
    }

    async read() { // R
        const head = new Headers();
        const pars = {
            method: 'GET',
            headers: head,
            mode: 'cors',
            cache: 'default',
        };
        const req = 
            new Request(`${this.adr}read`)
        var response
        try {
            response = await fetch(req, pars)
        } catch (error) {
            this.err("read: fetch failed with", error)
            this.signals.error.emit(
                "Error "+String(error)+" for operation read"
            )
            return false
        }
        if (response.ok == false) {
            try {
                var resp = await response.json() // will give resp.detail
            } catch (error) {
                this.err('error detail response is not json')
                resp = {detail: '???'} // create something for resp.detail
            }
            this.err("read: req got error", response.status, resp.detail)
            this.signals.error.emit(
                `Error ${response.status}: "${resp.detail}" from server for operation read`
            )
            return false
        }
        var resp;
        try {
            resp = await response.json()
        } catch (error) {
            console.error(error)
            this.signals.error.emit(
                `Error ${error} in operation read`
            )
            return false
        }
        this.log(-1,"read: resp", resp)
        // backend replies with 
        // "persons" : [obj1, obj2, ..] 
        // this.object_name_plural : [obj1, obj2, ..]
        if (resp[this.object_name_plural] == undefined) {
            this.err(`Key ${this.object_name_plural} missing from server reply`)
            this.signals.error.emit(
                `Key ${this.object_name_plural} missing from server reply`
            )
            return false
        }
        this.data=resp[this.object_name_plural]
        this.log(-1,"read finished with",this.data)
        return true
    }

    async update(datum) { // U
        // at this point we assume that datum has key uuid
        const head = new Headers();
        head.append('Accept', 'application/json');
        head.append('Content-Type', 'application/json');
        const pars = {
            method: 'PUT',
            headers: head,
            mode: 'cors',
            cache: 'default',
            body: JSON.stringify(datum)
        };
        const req = 
            new Request(`${this.adr}update`)
        var response
        try {
            response = await fetch(req, pars)
        } catch (error) {
            this.err("read: fetch failed with", error)
            this.signals.error.emit(
                "Error "+String(error)+" for operation update"
            )
            return false
        }
        if (response.ok == false) {
            try {
                var resp = await response.json() // gives resp.detail
            } catch (error) {
                this.err('error response is not json')
                resp = {detail: '???'} // invent something into resp.detail
            }
            this.err("update: req got error", response.status, resp.detail)
            this.signals.error.emit(
                `Error ${response.status}: "${resp.detail}" from server for operation update`
            )
            return false
        }
        return true
    }

    async delete(uuid) { // D
        this.log(-1,"delete: uuid", uuid)
        const head = new Headers();
        head.append('Accept', 'application/json');
        head.append('Content-Type', 'application/json');
        const pars = {
            method: 'DELETE',
            headers: head,
            mode: 'cors',
            cache: 'default',
            body: JSON.stringify({"uuid": uuid})
        };
        const req = 
            new Request(`${this.adr}delete`)
        var response
        try {
            response = await fetch(req, pars)
        } catch (error) {
            this.err("read: fetch failed with", error)
            this.signals.error.emit(
                "Error "+String(error)+" for operation update"
            )
            return false
        }
        if (response.ok == false) {
            try {
                var resp = await response.json() // gives resp.detail
            } catch (error) {
                console.warn('error response is not json')
                resp = {detail: '???'} // invent something
            }
            this.err("delete: req got error", response.status, resp.detail)
            this.signals.error.emit(
                `Error ${response.status}: "${resp.detail}" from server for operation delete`
            )
            return false
        }
        return true
    }


} // HTTPDataSourceWidget

export { HTTPDataSourceWidget }
