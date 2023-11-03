import { Signal } from './widget.js';
import { BillBoard, BallPlayer } from './ballplayer.js';

class BillBoard2 extends BillBoard {
    // UP: signals
    createSignals() {
        this.signals.state_change = new Signal();
    }
    // IN: slots
    ball_throw_slot() { // connect all ball-throwing signals in here
        super.ball_throw_slot()
        this.stateSave()
    }
    // define state serialization
    stateToPar() {
        return this.counter.toString()
    }
    validatePar(par) {
        // return false if par can't parsed as an integer value
        return !isNaN(parseInt(par))
    }
    // define state deserialization
    parToState(par) {
        this.counter = parseInt(par)
        this.log(-1, "parToState: counter", this.counter)
        this.updateMessage()
    }
}

class BallPlayer2 extends BallPlayer {
    // UP: signals
    createSignals() {
        super.createSignals()
        this.signals.state_change = new Signal() // required for state management
    }
    // IN: slots
    catch_ball_slot() { // receive a ball
        super.catch_ball_slot()
        this.stateSave()
    }
    // define state serialization
    stateToPar() {
        let par = +this.has_ball // boolean to int
        this.log(-1, "stateToPar", par)
        return par.toString() 
    }
    // validate a serialized state
    validatePar(par) {
        // return false if par can't parsed as an integer value
        let i = parseInt(par)
        if (isNaN(i)) { // not an integer
            this.err("validatePar failed with par",par,":",i,"not a number")
            return false
        }
        if (i!=0 && i!=1) {
            this.err("validatePar failed with :",i,"not 0 or 1")
            return false
        }
        return true;
    }
    // define state deserialization
    parToState(par) {
        this.has_ball = (parseInt(par) == 1) // int to bool
        this.log(-1, "parToState", this.has_ball)
        this.setBall()
    }
    createState() {
        super.createState()
        this.stateSave()
        // initialize to not having a ball
    }
    throwBall() {
        if (!this.has_ball) {
            // we don't have the ball..
            return
        }
        this.has_ball = false
        this.setBall()
        this.stateSave()
        this.signals.throw_ball.emit()
    }
    
} // BallPlayer

export { BallPlayer2, BillBoard2 }
