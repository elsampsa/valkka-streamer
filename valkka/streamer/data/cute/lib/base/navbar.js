import { Widget, Signal } from './widget.js';

class Navitem extends Widget {
    constructor(title) {
        super(); // calls createSignals automagically
        this.title = title;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.clicked = new Signal();
    }
    // IN: slots
    // no slots
    createState() {
        if (this.element == null) {
            return
        }
        // a Navitem can have subitems :)
        this.navitems = new Array();
    }
    close() {
    }
    createElement() {
        this.element = document.createElement("li");
        this.element.className="nav-item";
        /*
        this.element.innerHTML 
            = `<a class="nav-link active" aria-current="page" href="#">${this.title}</a>`
        this.link = this.element.getElementsByTagName("a").item(0)
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }
        */
        this.element.innerHTML 
            = `<span class="nav-link active">${this.title}</span>`
        this.link = this.element.getElementsByTagName("span").item(0)
        this.link.style.cursor="pointer"
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }

        /*
        <li class="nav-item"> // this.element
          <a class="nav-link" href="#">title</a>
        </li>

        <li class="nav-item dropdown"> // this.element
          <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">Title</a>
          <ul class="dropdown-menu">
                SUBITEMS HERE
                ...
                <li class="nav-item"> // this.element
                  <a class="nav-link" href="#">title</a>
                </li>
                ...
          </ul>
        </li>
        */
    }
    getElement() { // parent uses this to attach it to the html tree
        return this.element;
    }

    // if a dropdown list element --> encapsulate with <li>
    // if has dropdown list element --> etc.

    toDropdown() {
        this.element.className="nav-item dropdown";
        /*
        this.element.innerHTML = `
        <a class="nav-link dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="false">
            ${this.title}
        </a>
        <ul class="dropdown-menu">
        </ul>
        `
        this.link = this.element.getElementsByTagName("a").item(0)
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }
        */
        this.element.innerHTML = `
        <span class="nav-link dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false">
            ${this.title}
        </span>
        <ul class="dropdown-menu">
        </ul>
        `
        this.link = this.element.getElementsByTagName("span").item(0)
        this.link.style.cursor="pointer"
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }

        this.list_element = this.element.getElementsByTagName("ul").item(0)
    }
    toDropdownItem() {
        this.link.className="dropdown-item"
    }

    setItems(...navitems) {
        // remove earlier Navitem(s)
        for (const navitem of this.navitems) {
            navitem.close();
            this.list_element.removeChild(navitem.getElement());
        }
        delete this.navitems;
        this.navitems = new Array();
        var is_dropdown = false; // we're not a dropdown menu..
        // create a new list of internal Navitem(s)
        for (const navitem of navitems) {
            if (!(navitem instanceof Navitem)) {
                this.err("addItem: needs a NavItem object instance");
            }
            else {
                navitem.toDropdownItem(); // inform item it belongs to a dropdown menu (i.e. that it's a dropdown item)
                is_dropdown = true; // and we are a dropdown menu
                this.navitems.push(navitem)
            }
        }
        if (is_dropdown) { this.toDropdown(); } // creates this.list_element
        // put in new Navitem(s) html
        for (const navitem of this.navitems) {
            this.list_element.appendChild(navitem.getElement());
        }
    }

} // Navitem

class Navbar extends Widget {
    
    constructor(id, title) {
        // parameters: id, title (of the navbar)
        super(); // calls createSignals automagically
        this.id = id;
        this.title = title;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.clicked = new Signal();
    }
    // IN: slots
    // no slots
    createState() {
        if (this.element == null) {
            return
        }
        this.navitems = new Array();
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
        if (this.element.tagName.toLocaleLowerCase() != "nav") {
            this.element = null;
            this.err("element must be of type 'nav'")
            return;
        }
        // let's not overwrite user-defined classes..
        // this.element.className="navbar navbar-expand-lg fixed-top navbar-dark bg-dark"
        this.addClasses("navbar","navbar-expand-lg","fixed-top")
        // "off-canvas navbar" example:
        // <nav class="navbar navbar-expand-lg fixed-top navbar-dark           bg-dark" aria-label="Main navigation">
        // "fixed navbar" example:
        // <nav class="navbar navbar-expand-md fixed-top navbar-dark           bg-dark">
        //
        /*
        this.element.innerHTML=`
        <div class="container-fluid">
            <a class="navbar-brand" href="#">${this.title}</a>
            <button class="navbar-toggler p-0 border-0" type="button" id="navbarSideCollapse" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="navbar-collapse offcanvas-collapse" id="navbarsExampleDefault">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                </ul>
            </div>
        </div>   
        `
        this.link = this.element.getElementsByTagName("a").item(0)
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }
        */
        this.element.innerHTML=`
        <div class="container-fluid">
            <span class="navbar-brand">${this.title}</span>
            <button class="navbar-toggler p-0 border-0" type="button" id="navbarSideCollapse" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="navbar-collapse offcanvas-collapse" id="navbarsExampleDefault">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                </ul>
            </div>
        </div>   
        `
        this.link = this.element.getElementsByTagName("span").item(0)
        this.link.style.cursor="pointer"
        this.link.onclick = (event) => {
            this.signals.clicked.emit()
        }
        this.list_element = this.element.getElementsByTagName("ul").item(0)
    }
    setItems(...navitems) {
        // remove earlier Navitem(s)
        for (const navitem of this.navitems) {
            navitem.close();
            this.list_element.removeChild(navitem.getElement());
        }
        delete this.navitems;
        this.navitems = new Array();
        // create a new list of internal Navitem(s)
        for (const navitem of navitems) {
            if (!(navitem instanceof Navitem)) {
                this.err("addItem: needs a NavItem object instance");
            }
            else {
                this.navitems.push(navitem)
            }
        }
        // put in new Navitem(s) html
        for (const navitem of this.navitems) {
            this.list_element.appendChild(navitem.getElement());
        }
    }


} // Navbar

export { Navbar, Navitem }
