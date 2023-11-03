import { Widget, Signal } from './widget.js';

class StatusPanel extends Widget {
    
    constructor(id) {
        super(); // calls createSignals automagically
        this.id = id;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.clicked = new Signal();
    }
    // IN: slots
    error_slot(item) {
        // set status of service named item to ERROR
        let th = this.services[item]
        if (th == undefined) {
            this.err("no such service", item)
            return
        }
        th.innerHTML=`
        <span class="badge bg-danger">Error</span>
        `
    }
    ok_slot(item) {
        // set status of service named item to OK
        let th = this.services[item]
        if (th == undefined) {
            this.err("no such service", item)
            return
        }
        th.innerHTML=`
        <span class="badge bg-success">OK</span>
        `
    }
    undef_slot(item) {
        // set status of service named item to N/A
        let th = this.services[item]
        if (th == undefined) {
            this.err("no such service", item)
            return
        }
        th.innerHTML=`
        <span class="badge bg-secondary">N/A</span>
        `
    }
    createState() {
        if (this.element == null) {
            return
        }
        this.services = new Object()
    }
    createElement() {
        // hook into html elements and/or create new ones, etc.
        // for example:
        // this.element = document.getElementById(this.id)
        // this.element = document.createElement("tr")
        this.element = document.getElementById(this.id)
        if (this.element == null) {
            this.err("could not find element with id", this.id)
            return
        }
        if (this.element.tagName != "TABLE") {
            this.err("html element tag must be table, not", this.element.tagName)
            return
        }
        this.element.innerHTML=`
        <thead>
        <tr>
            <th scope="col">Status</th>
            <th scope="col">Service</th>
        </tr>
        </thead>
        <tbody>
        </tbody>
        `
        this.body = this.element.getElementsByTagName("tbody").item(0)
    }
    setItems(...items) {
        this.body.innerHTML=``
        this.services = new Object();
        for (const item of items) {
            var el = document.createElement("tr")
            el.innerHTML=`
            <th></th><th>${item}</th>
            `
            this.body.appendChild(el)
            var th = el.getElementsByTagName("th").item(0)
            this.services[item] = th // html <th> element by name
            th.onclick = (par) => {
                this.log(-1,"sending",item)
                this.signals.clicked.emit(item)
            }
            th.innerHTML=`
            <span class="badge bg-secondary">N/A</span>
            `
        }
    }
} // StatusPanel

export { StatusPanel }
