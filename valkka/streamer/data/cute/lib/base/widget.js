
// first, some generic helper functions
function assertKeys(keys, obj) {
    // check obj for keys
    keys.forEach(key => {
        if (!obj.hasOwnProperty(key)) {
            console.trace()
            throw(`missing key ${key}`)
        }
    })
}

function boxify(element) {
    if (element == undefined) {
        element=document.getElementsByTagName("body").item(0)
    }
    element.classList.add("border")
    element.classList.add("border-primary")
    var children = element.children;
    for (var i = 0; i < children.length; i++) {
        boxify(children[i]);
    }
}


function getPageParameters() {
    // get urlencoded parameters as a dictionary
    var url = new URL(document.documentURI);
    var obj = new Object()
    for (const [key, value] of url.searchParams) {
        // console.log(key,":", value)
        obj[key] = value
    }
    return obj
}

function equalSets(setA, setB) {
    // check if two sets are equal
    for (const elem of setB) {
      if (!setA.has(elem)) {
        return False
      }
    }
    return True
}

function uuidv4() {
    // as per https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
  }

function csv2obj(str) {
  // split a string like this: "orange=1,banana=2,apple=3" into an object {orange:1, banana:2, apple:3}
  var obj = new Object()
  if (str.length < 1) {
    return obj;
  }
  str.split(",").forEach(function(substring) {
    let parts = substring.split("=");
    obj[parts[0]] = parseInt(parts[1]);
  });
  return obj
}

function obj2csv(obj) {
    return Object.entries(obj)
        .map(([key, value]) => `${key}=${value}`)
        .join(",");
}

/*Base class for Widgets
*/
class Widget {
    constructor(id) {
        this.id = id
        this.loglevel = 0; // 0 = normal.  smaller: useless, bigger: usefull
        this.signals = new Object(); // i.e. json
        this.createSignals();
    }
    createElement() { // set the html element corresponding to this component
        this.err("you must subclass createElement");
        // the main html element dom object shall be in the member this.element
    }
    createState() {
        this.err("you must subclass createState");
    }
    deleteState() { // remove any mem reserving state variables if necessary
    }
    deleteElement() { // remove any html element(s) if necessary
    }
    createSignals() {
        this.err("you must subclass createSignals");
    }
    setVisible(visible) { // set html element visible or not
        this.log(-1, "setVisible", visible)
        if (!(typeof visible === 'boolean')) {
            this.err("need boolean value")
        }
        if (this.element) {
            if (visible) {
                if (this.isVisible()) { // already visible
                    // this.log(-2, "already visible");
                    // return
                }
                else {
                    // recoved saved visibility style
                    // this.log(-2, "style.display: recovering", this.style_display_saved);
                    this.element.style.display = this.style_display_saved
                }
            }
            else { // need to hide
                if (!this.isVisible()) { // already hidden
                    // this.log(-2, "already hidden");
                }
                else {
                    // this.log(-2, "will save style.display:",this.element.style.display)
                    this.style_display_saved = this.element.style.display // save current visibility style
                    this.element.style.display = "none";
                }
            } // if visible
            if (!visible) {
                //this.log(-1, "setVisible: calling hideCallback", visible)
                this.hideCallback()
                }
            else {
                //this.log(-1, "setVisible: calling showCallback", visible)
                this.showCallback()
            }
        } // element
    }
    hideCallback() {
    }
    showCallback() {
    }
    isVisible() { // true: element is visible, false: it is hidden
        if (this.element) {
            return this.element.style.display != "none";
        }
    }
    hide() {
        this.setVisible(false);
    }
    show() {
        this.log(-1, "show")
        this.setVisible(true);
    }
    setStyles(obj) {
        if (this.element) {
            Object.entries(obj).forEach( // javascript
            ([key, value]) => {
                this.element.style[key] = value
            })
        }
    }
    getStyle(key) {
        if (this.element) {
            return this.element.style[key]
        }
    }
    addClasses(...classnames) {
        if (this.element) {
            classnames.forEach(classname => { 
                this.element.classList.add(classname)
            })
        }
    }
    remClasses(...classnames) {
        if (this.element) {
            classnames.forEach(classname => { 
                this.element.classList.remove(classname)
            })
        }
    }
    close() {
        for (const [name, signal] of Object.entries(this.signals)) {
            signal.close();
        }
        delete this.signals;
        this.deleteState();
        this.deleteElement();
    }
    log(...args) {
        // console.log("loglevel", this.loglevel, "args", args)
        if (args[0] < this.loglevel) {
            return;
        }
        args.splice(0, 1);
        args.unshift(this.constructor.name + ":" + this.id + ":");
        console.log(...args);
    }
    err(...args) {
        args.unshift(this.constructor.name + ":");
        console.error(...args);
    }
    setLogLevel(num) {
        this.loglevel = num;
    }
    /* state management
    first time when page is loaded (or refreshed)
    <script>
    create widgets
    initial slots calling.. to get data, etc.
    loadState() function .. each widget examines it's part from the url
    after calling that function, widget goes into a state where it is updating
    the url: 
    that should be a popstate callback
    </script>
    */
   /*
    getStatePar() {
        // call when the page is loaded for the first time / refreshed
        // Get the current URL parameters
        const searchParams = new URLSearchParams(window.location.search);
        this.log(-1,"searchParams",searchParams);
        // Get the value of a specific parameter
        return searchParams.get(this.id);
    }
    setStatePar(par) {
        this.log(-1, "setStatePar", par)
        if (par==null) {
            this.log(-1, "not setting state par")
            return
        }
        
    }
    */
    /*
    loadInitialState() {
        this._track = true
        let par = this.getStatePar()
        if (par) {
            this.log(-1, "initial state par", par)
            this.parToState(par)
        }
        else {
            this.log(-1, "no initial state parameter")
            this.stateSave()
            // TODO: this should be handled differently: 
            // modifying the current state, instead of inserting a new state
        }
        //if (track) {
        window.addEventListener('popstate', (event) => {
            this.log(-1, "popstate", event)
            if (event.state && event.state.ignore) {
                this.log(-1, "popstate: ignoring")
                return;
            }
            // and cached state has been recovered
            // (user has clicked browser's fw/back buttons)
            // get the parameter for this widget from the url
            // and set widget's state according to that parameter
            par = this.getStatePar()
            if (par) {
                this.parToState(par)
            }
        });
        //}
    }*/
    stateSave() {
        var par = this.stateToPar()
        this.log(-1,"stateSave", par)
        // if (par != null && this.signals.state_change != null) {
        if (this.signals.state_change != null) { // par _can_ be null
            //let obj = {}
            //obj[this.id] = par
            const keyval = [this.id, par];
            this.signals.state_change.emit(keyval);
        }
        else {
            // this.err("did not emit state_save", par, this.signals.state_change)
        }
    }
    parToState(par) {
        // deserialize par and set the state of the widget
    }
    validatePar(par) {
        // check that a serialized state parameter is a legit one
        return true;
    }
    stateToPar() {
        // serialize state of the widget and return a par
        return null;
    }
}

class Signal {
    constructor() {
        this.callbacks=new Array();
    }
    connect(method) { // register method that's called when emit is called
        this.callbacks.push(method);
    }
    disconnect(method) { //  deregister a method
        let i = this.callbacks.find(func => func == method);
        if (i>0) {
            this.callbacks.pop(i);
        }
        else {
            console.log("Signal: could not find method from callback list");
        }
    }
    emit(par) { // call all registered functions when signal is emitted
        // this.callbacks.forEach(func => func(obj));
        this.callbacks.forEach(cb => {
           cb(par);
        });
    }
    close() {
        delete this.callbacks;
    }
}


class ElementWidget extends Widget {
    // just register the html element for this widget
    constructor(id) {
        super();
        this.id = id
        this.createElement();
        this.createState();
    }
    createSignals() {};
    createElement() {
        this.element = document.getElementById(this.id)
        if (this.element == null) {
            this.err("could not find element with id", this.id)
            return
        }
    };
    createState() {};
}

class DummyWidget extends Widget {
    // everything that comes to the slot
    // is just dumped to the console
    constructor() {
        super();
        this.createElement();
        this.createState();
    }

    // IN: slots
    slot(par) {
        this.log(0, "got ", par)
    }

    createSignals() {};
    createElement() {};
    createState() {};
}

class DumpWidget extends Widget {
    // data arriving to slot is
    // stringified & dumped into the DOM
    constructor(id) {
        super();
        this.id = id;
        this.createElement();
        this.createState();
    }

    // IN: slots
    slot(par) {
        this.log(0, "got ", par)
        this.element.innerHTML = JSON.stringify(par, null, '\t')
    }

    createSignals() {};
    createElement() {
        this.log(0, this.id)
        this.element = document.getElementById(this.id)
        this.log(0, this.element)
    };
    createState() {};
}

export { Widget, Signal, DummyWidget, DumpWidget, ElementWidget,
    assertKeys, getPageParameters, equalSets, uuidv4, boxify, csv2obj, obj2csv };
