import { Widget, Signal } from './widget.js';

class FormFieldWidget extends Widget {
    // NOTE: these are the individual input fields of the form
    // for the actual FormWidget, please see below
    constructor(ctx) {
        super()
        this.unique_name = ctx.unique_name
        this.key = ctx.key
        this.datamodel = ctx.datamodel
        this.createElement()
        this.createState()
    }

    createSignals() {
    }

    createState() {
    }

    createElement() {
        this.log(-1, "formfieldwidget: datamodel:", this.datamodel)
        let uniquename = this.unique_name + "-" + this.key // i.e. "myInputForm-email"
        this.element = document.createElement("div");
        this.element.classList.add("mb-3");
        var line = `
        <label for="${uniquename}" class="form-label">${this.datamodel.label}</label>
        <input class="form-control" id="${uniquename}">
        <div class="valid-feedback">ok!</div>
        `
        // <input type="email" class="form-control" id="${uniquename} aria-describedby="emailHelp">
        if (this.datamodel.help != undefined) {
            line.concat(`
            <div id="${this.id}Help" class="form-text">${this.datamodel.help}</div>
            `)
        }
        this.element.innerHTML = line
        // cache the input fields
        this.input = this.element.getElementsByTagName("input").item(0)
        this.valid_msg = this.element.getElementsByClassName("valid-feedback").item(0)
    }

    getElement() { // html element for FormWidget
        return this.element
    }

    clearWarnings() {
        this.input.classList.remove("is-valid")
        this.input.classList.remove("is-invalid")
    }
    

    clear() {
        this.input.value = ""
        this.clearWarnings()
    }


    get() {
        let res = this.datamodel.check(this.input.value)
        this.log(-1, "get: check", res)
        if (res.value == null) { // something wen't wrong..
            // set warning msg & valid/is-valid class
            this.input.classList.remove("is-valid")
            this.input.classList.add("is-invalid")
            this.valid_msg.classList.remove("valid-feedback")
            this.valid_msg.classList.add("invalid-feedback")
            this.valid_msg.innerHTML = res.error
            return null
        }
        else {
            this.input.classList.add("is-valid")
            this.input.classList.remove("is-invalid")
            this.valid_msg.classList.add("valid-feedback")
            this.valid_msg.classList.remove("invalid-feedback")
            this.valid_msg.innerHTML = ''
            return res.value
        }
    }
    set(par) {
        this.input.value = par
    }
}


class FormWidget extends Widget {
    /* Adaptable input form as a popup window
    */
    constructor(id, title="Popup Title") {
        super(); // calls createSignals automagically
        this.id = id;
        this.title = title;
        this.unique_name = `${id}-Form`
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() {
        // create: carries a new record
        // with just the data defined by call to datamodel_slot
        this.signals.create = new Signal(); // C
        // update: carries updated record
        // with updated fields from the datamodel
        // plus hidden fields of the original datum
        this.signals.update = new Signal(); // U
    }
    // IN: slots
    datamodel_slot(datamodel) {
        // the input form fields adapts to a datamodel
        // you could also subclass this and hardcode the 
        // desired input fields
        this.datamodel = datamodel;
        this.log(-1, "datamodel_slot", datamodel)
        for (const [key, model] of Object.entries(this.datamodel)) {
            var input_field = new FormFieldWidget(
                {
                    unique_name: this.unique_name, // e.g. "myInputForm"
                    key: key, // i.e. e.g. "surname"
                    datamodel: model // metadata description for "surname"
                }
            )
            this.input_fields[key] = input_field
            this.element.appendChild(input_field.getElement())
        }
    }
    current_datum_slot(datum) {
        if (this.datamodel == null) {
            this.err("current_datum_slot: please call datamodel_slot first");
            return;
        }
        // sets the current data in the form fields
        this.log(-1, "current_datum_slot got:", datum)
        if (datum == null) {
            this.current_datum = null;
            this.clear();
            return;
        }
        this.current_datum = structuredClone(datum);
        // run over input fields, previously created by calling
        // datamodel_slot and fills input fields values from current_datum
        // 
        // current_datum may have "hidden" fields (like uuid) not described
        // by the datamodel: these are not visible / editable in the form fields
        // 
        // you could also subclass a simplified version that hard-codes
        // the input fields
        for (const [key, input_field] of Object.entries(this.input_fields)) {
            // put into the form all fields defined by the datamodel
            let value = this.current_datum[key]
            if (value == undefined ) {
                this.err("current_datum_slot: got unexpected key", key)
            }
            else {
                input_field.set(datum[key])
            }
        }
    }
    create_slot() {
        // opens the dialog with empty fields
        if (this.datamodel == null) {
            this.err("current_datum_slot: please call datamodel_slot first");
            return;
        }
        this.current_datum = null;
        this.clear(); // empty the fields
        this.bootstrap_modal.toggle(); // show form
    }
    update_slot() {
        // open dialog in "update" mode
        // this.current_datum must be != null
        // form fields have been earlier filled with
        // call to current_datum_slot
        if (this.datamodel == null) {
            this.err("current_datum_slot: please call datamodel_slot first");
            return;
        }
        if (this.current_datum == null) {
            // can't update non-existing datum
            this.err("update_slot: current_datum is null -> can't update")
            return;
        }
        this.clearWarnings(); // cleanup warnings
        this.bootstrap_modal.toggle(); // show form
    }
    createState() {
        this.datamodel = null;
        this.current_datum = null;
        this.input_fields = new Object();
    }
    createElement() {
        /*
        Here we use the bootstrap modal API that assumes
        that the API pops up from a certain button 
        (instead we want it to pop-up from a signal!)
        it would actually be better to do this without the bootstrap API
        So first, we need to demangle the bootstrap modal API:
        In order for the JS API to work, some html must first
        be inserted into the DOM, like this:
        <div class="modal fade" id="exampleModal" tabindex="-1" 
        aria-labelledby="exampleModalLabel" aria-hidden="true">
        </div>
        */
        this.scaffold = document.createElement("div");
        this.scaffold.classList.add("modal")
        this.scaffold.classList.add("fade")
        this.scaffold.id = this.id
        this.scaffold.setAttribute("tabindex", "-1")
        this.scaffold.setAttribute("aria-labelledby", `${this.id}Label`)
        this.scaffold.setAttribute("ariaHidden", true)
        this.scaffold.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h1 class="modal-title fs-5" id="${this.id}Label">${this.title}</h1>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
            <div class="modal-body">
            </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-primary" type="submit">Save</button>
                </div>
            </div>
        </div>
        `
        var body = document.getElementsByTagName("body").item(0)
        body.appendChild(this.scaffold)
        this.bootstrap_modal = new bootstrap.Modal(this.scaffold);
        this.element = this.bootstrap_modal._element;
        // We have now in this.bootstrap_modal that obeys
        // the bootstrap JS API
        // let's get a handle to the modal save button
        const matches_btn = this.element.getElementsByClassName("btn-primary");
        this.save_button = matches_btn.item(0);
        // handle to the popup body:
        const matches_body = this.element.getElementsByClassName("modal-body");
        this.body = matches_body.item(0);
        // let's add a form therein:
        this.element = document.createElement("form");
        // this.element.classList.add("needs-validation")
        // this.element.classList.add("was-validated")
        this.body.appendChild(this.element);
        this.save_button.onclick = (event) => {
            this.checkInput()
        }
    }
    clear () {
        Object.entries(this.input_fields).forEach(([key, input_field])=> input_field.clear());
    }
    clearWarnings () {
        Object.entries(this.input_fields).forEach(([key, input_field])=> input_field.clearWarnings());
    }
    checkInput() { // checks input & if ok, sends signals with the new/updated data
        this.log(-1, "checkInput")
        var create = false; // create or update?
        // create a new empty datum or update the old one
        if (this.current_datum == null) { // C
            var datum = new Object()
            create = true;
        }
        else { // U
            datum = this.current_datum
            // datamodel / form fields will be overwritten
            // hidden fields such as uuid are not touched
        }
        let fail = false
        for (const [key, input_field] of Object.entries(this.input_fields)) {
            // calling get performs check on the fields
            // & writes a warning for the user is something went wrong
            var value = input_field.get()
            if (value == null) {
                fail = true
            }
            datum[key] = value
        }
        if (fail) { // checking one of the fields failed
            // if failed, then don't close the form yet
        }
        else if (create) {
            this.signals.create.emit(datum);
            this.bootstrap_modal.toggle(); // success! hide popup
        }
        else {
            this.signals.update.emit(datum);
            this.bootstrap_modal.toggle(); // success! hide popup
        }
    }
} // FormWidget

export { FormWidget }
