import { Widget, Signal } from '../lib/base/widget.js';

class ControlButtons extends Widget {
    
    constructor(id) {
        super(null);
        this.id = id;
        this.createElement();
        this.createState();
    }

    // IN: slots
    set_delay_slot(par) { // par: a float
        this.delay_element.innerHTML = Math.round(par);
    }

    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.plus = new Signal();
        this.signals.minus = new Signal();
        this.signals.left = new Signal();
        this.signals.right = new Signal();
        this.signals.up = new Signal();
        this.signals.down = new Signal();
        this.signals.home = new Signal();
        this.signals.fw = new Signal();
        this.signals.bw = new Signal();
    }
    createState() {
        // this.some_variable = true
        this.delay_element.innerHTML = "n/a"
    }
    createElement() {
        this.element = document.getElementById(this.id)
        // console.log("element", this.element)
        this.element.innerHTML=`
        <button type="button" class="btn btn-primary">+</button>
        <button type="button" class="btn btn-primary">-</button>
        <button type="button" class="btn btn-primary">left</button>
        <button type="button" class="btn btn-primary">right</button>
        <button type="button" class="btn btn-primary">up</button>
        <button type="button" class="btn btn-primary">down</button>
        <button type="button" class="btn btn-primary">home</button>
        <button type="button" class="btn btn-success">&raquo</button>
        <button type="button" class="btn btn-success">&laquo</button>
        <button type="button" class="btn btn-success">
            Delay: <span class="badge bg-secondary"></span>
        </button>
        `
        // console.log("ControlButtons:", this.element.children[0])
        this.element.children[0].onclick = () => {
            this.signals.plus.emit()
        }
        this.element.children[1].onclick = () => {
            this.signals.minus.emit()
        }
        this.element.children[2].onclick = () => {
            this.signals.left.emit()
        }
        this.element.children[3].onclick = () => {
            this.signals.right.emit()
        }
        this.element.children[4].onclick = () => {
            this.signals.up.emit()
        }
        this.element.children[5].onclick = () => {
            this.signals.down.emit()
        }
        this.element.children[6].onclick = () => {
            this.signals.home.emit()
        }
        this.element.children[7].onclick = () => {
            this.signals.fw.emit()
        }
        this.element.children[8].onclick = () => {
            this.signals.bw.emit()
        }
        this.delay_element = this.element.children[9].children[0]
    }
    // internal methods
    someMethod() {
    }

} // CuteComponent

export { ControlButtons }
