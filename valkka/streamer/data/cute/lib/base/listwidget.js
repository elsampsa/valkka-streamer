import { Widget, Signal } from './widget.js';

class ListItemWidget extends Widget {
    // NOTE: this is an individual item in the ListWidget
    // for ListWidget itself, see below
    constructor(parent, index, datum) {
        // parent: ListWidget
        // index: index of this ListItemWidget with its ListWidget
        // datum: a datum.  should have at least key "uuid"
        super(parent); // creates this.signals
        this.index = index;
        this.datum = structuredClone(datum)
        this.createState();
        this.createElement();
    }
    // UP: signals
    createSignals() {
        this.signals.clicked = new Signal() // carries index
    }
    // IN: slots
    activate_slot() {
        this.element.classList.add("table-warning"); // highlight
    }
    deactivate_slot() {
        this.element.classList.remove("table-warning"); // dehighlight
    }
    // state & html elements
    createState() { 
    }
    deleteState() {
    }
    createElement() { // <tr>
        // console.log(">", this.data);
        this.element = document.createElement("tr");
        this.element.innerHTML = this.getItemHTML()
        this.element.onclick = (event) => {
            this.signals.clicked.emit(this.datum.uuid);
        }
        /* // if you want to highlight when mouse hovers over the element
        this.element.onmouseover = (event) => {
            this.element.classList.add("table-primary");
        }
        this.element.onmouseout = (event) => {
            this.element.classList.remove("table-primary");
        }
        */
    }
    close() {
    }
    // other
    getElement() { // parent uses this to attach it to the html tree
        return this.element;
    }
    getDatum() {
        return this.datum;
    }
    getItemHTML() {
        throw("ListItemWidget: getItemHTML must be subclassed to adapt to your datamodel")
        /* for example:
        return `
        <th scope="row">${this.datum.index}</th>
        <td>${this.datum.name}</td>
        <td>${this.datum.surname}</td>
        <td>${this.datum.email}</td>
        `
        */
    }
} // ListItemWidget


class ListWidget extends Widget {
    
    listItemClass = ListItemWidget;

    constructor(id) {
        super(); // calls createSignals
        this.id = id;
        this.createElement();
        this.createState();
        this.generateList([]);
    }
    // UP: signals
    createSignals() {
        // carries active datum
        // if no active datum, then carries null:
        this.signals.current_datum = new Signal();
    }
    // IN: slots
    datums_slot(datums) {
        this.log(-2, "datums_slot", datums)
        // clear all previous data & set new one
        this.datums = structuredClone(datums);
        this.generateList(datums);
        if (this.current_datum != null) { // there was an activated/chosen element in the list..
            let uuid = this.current_datum.uuid; // let's save it's uuid
            this.current_datum = null; // set none selected
            this.log(-1, "datums_slot: using previously acticated uuid", uuid)
            this.activate_slot(uuid); // look uuid in new/updated datums & reset it to activated/chosen element
        }
    }
    activate_slot(uuid) {
        // uuid == null deactivates all
        this.log(-1, "activate_slot: uuid=", uuid)
        if ( (this.current_datum != null) && (this.current_datum.uuid == uuid) ) {
            this.log(-1, "already chosen")
            return;
        }
        this.current_datum = null;
        this.list_items.forEach(list_item => { // set current datum to matching uuid
            list_item.deactivate_slot();
            let datum = list_item.getDatum();
            if (datum.uuid == undefined) {
                this.err("activate_slot: datum with no uuid!")
                return
            }
            if (uuid == datum.uuid) {
                this.log(-1, "activate_slot: activating uuid", uuid)
                this.current_datum = datum;
                list_item.activate_slot();
                this.signals.current_datum.emit(datum);
            }
        })
        if (this.current_datum == null) { // found no matching element
            this.log(-1, "activate_slot: deactivating")
            this.signals.current_datum.emit(null); // tell any connected widgets that nothings been chosen
        }
    }
    // state & html element
    createState() {
        this.current_datum = null
        this.list_items = new Array()
    }
    deleteState() {
        this.list_items.forEach(item => item.close());
        delete this.list_items;
    }
    createElement() { // <table>
        this.element = document.getElementById(this.id)
        if (this.element == null) {
            this.err("could not find element with id", this.id)
            return
        }
        if (this.element.tagName != "TABLE") {
            this.err("html element tagname must be table, not", this.element.tagName)
            this.element = null
            return
        }
        this.element.innerHTML=`
        <thead>
        </thead>
        <tbody>
        </tbody>
        `
        this.thead = this.element.getElementsByTagName("thead").item(0)
        this.body = this.element.getElementsByTagName("tbody").item(0)
        // we could generate this programmatically:
        this.thead.innerHTML=this.getHeaderHTML()
    }
    generateList(datums) {
        // close & remove earlier ListItemWidget(s):
        this.list_items.forEach(item => {
            this.body.removeChild(item.getElement());
            item.close();
        });
        delete this.list_items;
        this.list_items = new Array()
        var cc=0;
        datums.forEach(datum => {
            var item = new this.listItemClass(this, cc, datum);
            item.signals.clicked.connect(
                this.activate_slot.bind(this)
            );
            this.list_items.push(item);
            this.body.appendChild(item.getElement());
            cc = cc+1;
        }
        )
    }

    getHeaderHTML() {
        throw("ListWidget: getHeaderHTML must be subclassed to adapt to your datamodel")
        // for example:
        /*
        return `
        <tr>
        <th scope="col">#</th>
        <th scope="col">First</th>
        <th scope="col">Last</th>
        <th scope="col">Email</th>
        </tr>
        `
        */
    }

} // ListWidget


class ExampleListItemWidget extends ListItemWidget {
    getItemHTML() {
        return `
        <th scope="row">${this.index}</th>
        <td>${this.datum.name}</td>
        <td>${this.datum.surname}</td>
        <td>${this.datum.email}</td>
        `
    }
}

class ExampleListWidget extends ListWidget {
    listItemClass = ExampleListItemWidget;

    getHeaderHTML() {
        return `
        <tr>
        <th scope="col">#</th>
        <th scope="col">First</th>
        <th scope="col">Last</th>
        <th scope="col">Email</th>
        </tr>
        `
    }

}

export { ListWidget, ListItemWidget, ExampleListWidget }
