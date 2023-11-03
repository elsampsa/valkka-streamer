import { Widget } from './widget.js';

class StateWidget extends Widget {
    
    constructor(id) {
        super(); // calls createSignals automagically
        this.id = id;
        this.createElement();
        this.createState();
    }
    createSignals() {
    }
    createElement() {
    }
    createState() {
        this.cache = {}
        this.widget_by_name = {}
        this.save_pending = false;
    }
    register(...widgets) {
        for (const widget of widgets) {
            if (widget.signals.state_change == null) {
                this.err("widget", widget.id, "doesn't have state_change signal");
                continue;
            }
            this.widget_by_name[widget.id] = widget
        }
        this.init()
        // add an event listener for browser fw/bw buttons
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
            this.pull() // update self.cache, based on the URL adr bar
            this.setStates()
        }) // event listener
    }
    setStates() {
        for (const [name, par] of Object.entries(this.cache)) {
            let widget = this.widget_by_name[name]
            // tell widget to update it's state,
            // according to par
            if (par!=null) {
                widget.parToState(par)
            }
        } // iterate cache
    }
    connectStateChanges() {
        for (const [id, widget] of Object.entries(this.widget_by_name)) {
            widget.signals.state_change.connect(
                this.state_change_slot.bind(this)
            )
        }
    }
    saveStateAtEveryChange() {
        for (const [id, widget] of Object.entries(this.widget_by_name)) {
            widget.signals.state_change.connect(
                this.state_save_slot.bind(this)
            )
        }
    }
    state_change_slot(keyval) {
        // keyval: [id, hash] == widget id name, serialized state
        // update this.cache
        const [id, hash] = keyval;
        this.log(-1,"state_change_slot: current cache", this.cache);
        this.log(-1,"state_change_slot: got id, hash", id, hash);
        /*
        this.log(-1,"state_change_slot: has", this.cache.hasOwnProperty(id))
        this.log(-1,"state_change_slot: different",this.cache[id] != hash)
        */
        if ((!this.cache.hasOwnProperty(id)) || (this.cache[id] != hash)) {
            this.cache[id] = hash
            this.log(-1,"state_change_slot: objs", this.cache)
            this.save_pending = true;
        }
    }
    state_save_slot() {
        if (this.save_pending) {
            this.push()
            this.save_pending = false
        }
    }
    init() {
        this.log(-1, "init")
        this.pull()
        this.validateInitialState()
        // cache has now been modified
        this.log(-1, "init: cache=", this.cache)
        this.setStates() // set widget states according to self.cache
        this.push0()
    }
    validateInitialState() { // subclass
    }
    setDefaultValues() {
        for (const [name, widget] of Object.entries(this.widget_by_name)) {
            this.cache[name] = widget.stateToPar()
        }
    }
    pull() {
        // get serialized state variables for each registered widget
        // from the url search pars
        // save to this.cache
        this.cache = {}
        this.log(-1, "pull: widget_by_name", this.widget_by_name)
        const searchParams = new URLSearchParams(window.location.search);
        for (const param of searchParams.entries()) {
            const [name, value] = param;
            this.log(-1, "pull: got from adr bar", name, value);
            let widget = this.widget_by_name[name]; // name matches?
            this.log(-1, "pull: corresponding widget:", widget)
            if (widget != null) { // we have a match
                if (widget.validatePar(value)) {
                    this.cache[name] = value
                }
                else {
                    this.err("pull: parameter validation failed for", name)
                }
            }
        }
        this.log(-1, "pull: cache now", this.cache)
    }
    push() {
        // create a new entry into the url history
        // corresponding to the current this.cache
        let newUrl = this.genUrl()
        this.log(-1, "push: pushState", newUrl.href)
        window.history.pushState(
            { ignore: false }, null, newUrl.href
        ); // first parameter would be recovered in event.state
    }
    push0() {
        // replase current url in the URL address bar
        // and browser history
        let newUrl = this.genUrl()
        this.log(-1, "push0: replaceState", newUrl.href)
        history.replaceState(
            { ignore: false }, null, newUrl.href
        );
        // location.replace(newUrl.href); // nopes
    }
    genUrl() {
        // get current search parameters from the URL
        // address field
        // create a new URL address field with the search
        // parameters corresponding to widget names
        // substituted by values from self.cache
        let newUrl = new URL(window.location.href)
        this.log(-1,"genUrl: current Url",newUrl.href)
        // get & modify/append the current URL parameters
        // Get the current URL parameters
        const searchParams = new URLSearchParams(window.location.search);
        // Set the value of a specific parameter
        for (const [name, par] of Object.entries(this.cache)) {
            if (par != null ) {
                searchParams.set(name, par);
            }
            else {
                this.log(-1,"genUrl: null parameter for", name);
                searchParams.delete(name);
            }
        }
        // Generate the new URL with updated parameters
        newUrl.search = searchParams.toString()
        this.log(-1, "newUrl", newUrl.href);
        /*
        this.log(-1, "window.location", window.location);
        const newUrl = `${window.location.host}/${window.location.pathname}?${searchParams.toString()}`;
        this.log(-1, "newUrl", newUrl);
        */
        // Update the browser history with the new URL and parameters
        // history.replaceState(null, null, newURL);
        return newUrl
    }
}

export { StateWidget }
