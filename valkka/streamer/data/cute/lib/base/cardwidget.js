import { Widget, Signal } from './widget.js';

class CardWidget extends Widget {
    
    constructor(id) {
        super(); // calls createSignals automagically
        this.id=id;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // no signals here!
        // feel free to add a button that sends a signal outside
        // this widget, etc.
    }
    // IN: slots
    datamodel_slot(datamodel) {
        this.log(-1, "datamodel_slot", datamodel)
        this.datamodel=datamodel;
    }
    current_datum_slot(datum) {
        this.log(-1, "current_datum_slot", datum)
        this.current_datum=datum;
        if (this.datamodel == null) {
            this.err("datamodel_slot must be called first")
            return;
        }
        if (this.current_datum == null) {
            this.log(-1, "current_datum_slot: got null datum");
            this.element.innerHTML = ``;
            return;
        }
        /* // from bootstrap examples:
        <div class="card">
        <h5 class="card-header">Featured</h5>
        <div class="card-body">
            <h5 class="card-title">Special title treatment</h5>
            <p class="card-text">With supporting text below as a natural lead-in to additional content.</p>
            <a href="#" class="btn btn-primary">Go somewhere</a>
        </div>
        </div>
        */
        this.element.innerHTML=`
        <div class="card">
            <h5 class="card-header">Details</h5>
            <div class="card-body">
                <div class="container">
                </div>
            </div>
        </div>
        `
        var body_element = this.element.getElementsByClassName("card-body")[0]
        var line = ``
        // var line = `<h5 class="card-title">Details</h5>`;
        for (const [key, value] of Object.entries(datum)) { // datum key, value
            // fields not described by the datamodel (uuid for example)
            // are sliently omitted
            // you can also subclass this whole method & "hardcode" the field labels
            // and used fields
            if (this.datamodel.hasOwnProperty(key)) {
                let datamodel = this.datamodel[key] // see datasource for definition
                const label = datamodel["label"]
                this.log(-2, `using ${label}: ${value}`);
                line = line.concat(`
                <div class="row justify-content-start">
                    <div class="col-4 card-text">
                        ${label}
                    </div>
                    <div class="col-4 card-text">
                        ${value}
                    </div>
                </div>
                `)
            }
        body_element.innerHTML=line
        }
    }
    createState() {
        this.datamodel = null;
        /* // datamodel has metadata for all data fields:
        {
            key  :  same key as in datum
            {
                label:  a label for visualization of data with this key
                help :  a longer description of the field
                check:  a function that checks if the data field is ok
            }
        }
        */
        this.current_datum = null;
    }
    createElement() {
        this.element = document.getElementById(this.id);
        if (this.element == null) {
            this.err("could not find element with id", this.id)
        }
    }

} // CardWidget

export { CardWidget }
