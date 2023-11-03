import { Widget, Signal } from './widget.js';

// this is for the tutorial & for demo purposes only,
// so as an exception to the rule, we have two widgets
// in the same file

class BillBoard extends Widget {
    // book-keeping of ball throws
    constructor(id) {
        super();
        this.id = id;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // no outgoing signals
    }
    // IN: slots
    ball_throw_slot() { // connect all ball-throwing signals in here
        this.log(-1, "ball_throw_slot")
        this.counter += 1
        this.updateMessage()
    }
    createState() {
        if (this.element == null) {
            this.err("no html element")
            return
        }
        // the only state variable:
        this.counter = 0 // how many times ball has been thrown
        this.updateMessage()
    }
    createElement() {
        this.element = document.getElementById(this.id)
        if (this.element == null) {
            this.err("could not find element with id", this.id)
            return
        }
        this.element.innerHTML=`
        <div class="alert alert-primary" role="alert">
        </div>
        `
        this.text_par=this.element.children[0]
    }
    updateMessage() {
        this.text_par.innerHTML=`
        Ball has been thrown ${this.counter} times
        `
    }
}

class BallPlayer extends Widget {
    // A widget you can throw ball with
    // to another widget
    constructor(id) {
        super();
        this.id = id;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() {
        this.signals.throw_ball = new Signal(); // sends the ball to another widget
    }
    // IN: slots
    catch_ball_slot() { // receive a ball
        this.log(-1, "catch_ball_slot")
        this.has_ball = true
        this.setBall()
    }
    createState() {
        if (this.element == null) {
            this.err("no html element")
            return
        }
        this.has_ball = false // the only state variable
        this.setBall()
        // initialize to not having a ball
    }
    createElement() {
        this.element = document.getElementById(this.id)
        if (this.element == null) {
            this.err("could not find element with id", this.id)
            return
        }
        this.element.innerHTML=`
        <button class="btn btn-outline-primary">Throw</button>
        `
        this.button=this.element.getElementsByTagName("button").item(0)
        this.button.onclick = (event) => {
            this.throwBall()
        }
    }
    throwBall() {
        if (!this.has_ball) {
            // we don't have the ball..
            return
        }
        this.has_ball = false
        this.setBall()
        this.signals.throw_ball.emit()
    }
    setBall() { // changes html element appearance according this.has_ball
        if (this.has_ball) {
            this.button.innerHTML=`Throw me (I have the ball!)`
            this.button.className="btn btn-outline-primary"
        }
        else {
            this.button.innerHTML=`Throw`
            this.button.className="btn btn-outline-primary"
        }
    }
    
} // BallPlayer

export { BallPlayer, BillBoard }
