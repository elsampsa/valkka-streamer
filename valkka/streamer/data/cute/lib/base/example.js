import { Widget, Signal } from './widget.js';

class MyWidget extends Widget {
    
    constructor(id) {
        super(); // calls createSignals automagically
        this.id = id;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.some_signal = new Signal();
    }
    // IN: slots
    some_slot(par) {
        // permute state, send signals, do something with the elements
        // call methods that does all those things..
    }
    another_slot(obj) {
        // for slots that receive objects or arrays,
        // before permuting them, create a mutable copy
        // obj=obj.slice() // for arrays with simple objects
        // obj=structuredClone(obj) // for complete objects
    }
    createState() {
        if (this.element == null) {
            return
        }
        // this.some_variable = true
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
    }
    deleteState() { // optional
        // remove any mem reserving state variables if necessary
    }
    deleteElement() { // optional
        // remove any html element(s) if necessary
    }
    // internal methods
    someMethod() {
    }

} // MyWidget

export { MyWidget }
