import { Widget, Signal } from '../lib/base/widget.js';

class VideoCanvas extends Widget {
    
    constructor(id) {
        super(null);
        // images paths: relative to the html
        // this.bg_image="assets/dog.jpg"; // for debugging
        this.bg_image="assets/cameras.jpg";
        this.id = id; // id of an HTML "canvas" element
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.update = new Signal() // carries the current ROI being edited
    }
    // IN: slots
    set_video_element_slot(video_element) {
        this.video_element = video_element
        this.video_element.addEventListener('play', this.draw.bind(this), false);
    }
    set_rois_slot(rois) {
        // rois: dictionary: key: uuid, value: dict with keys: left, right, top, bottom
        this.rois = rois
        this.current_roi = null
        this.current_roi_uuid = null
        this.redraw()
    }
    set_detections_slot(detections) {
        // detections: dictionary: key: uuid, value: dict with keys: tag, left, right, top, bottom
        this.detections = detections
        this.redraw()
    }
    set_selected_slot(key) {
        // null = no selection
        this.current_roi = null // a copy of the selected ROI
        this.current_roi_uuid = null // uuid of the selected ROI
        if (key != null) {
            if (this.rois.hasOwnProperty(key)) {
                this.log(-1, "set_selected_slot", key)
                this.current_roi_uuid = key
                this.current_roi = structuredClone(this.rois[key])
                this.log(-1, "set_selected_slot: current_roi", this.current_roi_uuid)
            }
            else {
                this.log(0, "set_selected_slot: no such key", key)
            }
        }
        this.redraw()
    }
    save_slot() {
        // the current roi under editing should be saved
        if (this.current_roi == null) {
            this.log(-1, "VideoCanvas: save_slot: no current roi!")
            return
        }
        this.log(-1, "VideoCanvas: save_slot: sending current roi", this.current_roi_uuid)
        let dic = {}
        dic[this.current_roi_uuid] = {
                top: this.current_roi.top,
                left: this.current_roi.left,
                right: this.current_roi.right,
                bottom: this.current_roi.bottom
            }
        this.signals.update.emit(dic)    
    }
    // button slots
    // digital pan/zoom slots
    plus_slot() {
        this.set_zoom += 0.1
        if (this.set_zoom > 10) {
            this.set_zoom = 10
        }
        this.redraw()
    }
    minus_slot() {
        this.set_zoom -= 0.1
        if (this.set_zoom < 1) {
            this.set_zoom = 1
        }
        this.redraw()
    }
    left_slot() {
        this.set_X0 -= Math.round(this.image_width() * 0.1)
        this.redraw()
    }
    right_slot() {
        this.set_X0 += Math.round(this.image_width() * 0.1)
        this.redraw()
    }
    down_slot() {
        this.set_Y0 += Math.round(this.image_height() * 0.1)
        this.redraw()
    }
    up_slot() {
        this.set_Y0 -= Math.round(this.image_height() * 0.1)
        this.redraw()
    }
    home_slot() {
        this.set_X0 = 0
        this.set_Y0 = 0
        this.set_zoom = 1
        this.redraw()
    }
    // ..slots end
    // STATE:
    createState() {
        this.mouse_verbose=false
        // zoom/pan state:
        this.set_X0=0      // x-starting point in canvas for bitmap drawing (set by user)
        this.set_Y0=0      // y-starting point in canvas for bitmap drawing (set by user)
        this.set_zoom=1    // zoom (set by user)
        this.drag_state=0
        // rois & the active roi state:
        this.rois=[] // list of dicts: each dict: key: uuid, value: dict: keys: left, right, top, bottom, values: floats
        this.selected = -1
        this.current_roi=null // keys: left, right, top, bottom; values: floats
        this.current_roi_uuid=null // string
        this.detections=[] // list of dicts: each dict: key: uuid, value: dict: keys: left, right, top, bottom, values: floats
        this.coord_save=[0, 0]
        this.video_element = null;
        // bg image:
        this.base_image = new Image();
        this.base_image.src = this.bg_image; // set in the ctor
        this.log(-1, "VideoCanvas: createState")
        // async/await: https://stackoverflow.com/questions/15333256/draw-image-on-canvas
        // onload vs. complete:
        // https://stackoverflow.com/questions/16678993/why-is-image-onload-not-working
        if (this.base_image.complete) {
            this.imageLoaded()
        }
        else {
            this.base_image.onload = (event) => {
                this.imageLoaded()
            }
        }
    }
    createElement() {
        this.element = document.getElementById(this.id) // <canvas>
        // connect mouse gestures
        // must use = (event) => etc., otherwise this is not propagated correctly!
        this.element.onmousedown = (e) => { this.mouseDown(e) }
        // this.element.onmousedown = this.mouseDown
        this.element.onmousemove = (e) => { this.mouseMove(e) }
        // this.element.onmousemove = (event) => { this.log(-1, "fuck") };
        this.element.onmouseup = (e) => { this.mouseUp(e) }
        this.canvas = this.element.getContext('2d')
    }
    // internal methods
    imageLoaded() {
        // this.log(-1, "VideoCanvas: imageLoaded")
        this.redraw()
        this.base_image.onload = null;
    }
    draw() {
        if (this.video_element.paused || this.video_element.ended) {
            setTimeout(this.draw.bind(this), 20) // call this function again in 20 ms
            return false;
        }
        this.redraw() // uses this.video_element
        setTimeout(this.draw.bind(this), 20) // call this function again in 20 ms
    }
    redraw() {
        // this.log(-1, "redraw", this.getX0)
        // this.log(-1, "redraw", this.base_image, this.image_width())
        // this.log(-1, "X0", this.getX0(), "Y0", this.getY0(), "W", this.getWidth())
        this.canvas.clearRect(0, 0, this.image_width(), this.image_height())
        if (this.video_element != null) {
            this.canvas.drawImage(
                this.video_element, 
                this.getX0(), this.getY0(), this.getWidth(), this.getHeight()
            )
        }
        else {
            this.log(-1, "redraw: base image")
            this.canvas.drawImage(
                this.base_image, 
                // 0, 0, this.image_width(), this.image_height()
                this.getX0(), this.getY0(), this.getWidth(), this.getHeight()
            )   
        }
        for (const [uuid, bbox_] of Object.entries(this.rois)) { // loop bbox
            // console.log(">", uuid, this.current_roi_uuid);
            if (uuid != this.current_roi_uuid) {
                const [X0, Y0, X1, Y1] = this.getBBoxAbs([
                    bbox_.left,
                    bbox_.top,
                    bbox_.right,
                    bbox_.bottom
                ])
                this.canvas.beginPath();
                this.canvas.lineWidth = 1;
                this.canvas.strokeStyle = 'green';
                this.canvas.rect(X0, Y0, X1-X0, Y1-Y0)
                this.canvas.stroke();
            }
            else {
                // console.log(">>", uuid, this.current_roi)
            }
        } // loop bbox
        if (this.current_roi_uuid != null) { // highlight selected ROI
            let bbox_ = this.current_roi
            const [X0, Y0, X1, Y1] = this.getBBoxAbs([
                bbox_.left,
                bbox_.top,
                bbox_.right,
                bbox_.bottom
                ])
            this.canvas.beginPath();
            this.canvas.lineWidth = 2;
            this.canvas.strokeStyle = 'red';
            this.canvas.rect(X0, Y0, X1-X0, Y1-Y0)
            this.canvas.stroke();
        }
        for (const [uuid, bbox_] of Object.entries(this.detections)) { // loop detections
            const [X0, Y0, X1, Y1] = this.getBBoxAbs([
                bbox_.left,
                bbox_.top,
                bbox_.right,
                bbox_.bottom
            ])
            this.canvas.beginPath();
            this.canvas.lineWidth = 2;
            this.canvas.strokeStyle = 'blue';
            this.canvas.rect(X0, Y0, X1-X0, Y1-Y0)
            this.canvas.stroke();
            // Set the font style
            this.canvas.font = "30px Arial";
            // Set the text color
            this.canvas.fillStyle = "blue";
            // Write text to the canvas
            this.canvas.fillText(bbox_.tag, X0, Y0)
        }
    } // redraw
    // canvas getters
    image_width() {
        // return this.canvas_element.offsetWidth
        // this.log(-1, "image_width", this.element.width)
        return this.element.width
    }
    image_height() {
        // return this.canvas_element.offsetHeight
        return this.element.height
    }
    getWidth() {
        return this.set_zoom * this.image_width()
    }
    getHeight() {
        return this.set_zoom * this.image_height()
    }
    // set_zoom * width = width + 2*dx ==> solve for dx
    getX0() { //
        const dx = Math.round( (this.image_width() * (this.set_zoom - 1)) / 2 )
        // this.log(-1, "getX0: set_X0", this.set_X0)
        return this.set_X0 - dx
    }
    getY0() {
        const dy = Math.round( (this.image_height() * (this.set_zoom - 1)) / 2 )
        //this.log(-1, "Y0", Y0)
        return this.set_Y0 - dy
    }
    // bounding box helpers
    getBBoxAbs([x0, y0, x1, y1]) {
        // this.log(-1, "getBBoxAbs")
        return [
            this.getX0() + Math.round(x0 * this.getWidth()),
            this.getY0() + Math.round(y0 * this.getHeight()),
            this.getX0() + Math.round(x1 * this.getWidth()),
            this.getY0() + Math.round(y1 * this.getHeight())
        ]
    }
    // coordinate helpers
    getRelX(x) {
        // this.log(-1, "getRelX:", x, this.getX0, this.getWidth)
        // 0, 30, 300 => -0.1 change..!
        return (x - this.getX0()) / this.getWidth()
    }
    getRelY(y) {
        return (y - this.getY0()) / this.getHeight()
    }
    getRelDiffX(dx) {
        // this.log(-1, "getRelX:", x, this.getX0, this.getWidth)
        // 0, 30, 300 => -0.1 change..!
        return dx / this.getWidth()
    }
    getRelDiffY(dy) {
        return dy / this.getHeight()
    }
    // mouse drag'n'release
    getMousePos(evt) {
        var rect = this.element.getBoundingClientRect() // abs. size of element
        const scaleX = this.element.width / rect.width        // relationship bitmap vs. element for X
        const scaleY = this.element.height / rect.height      // relationship bitmap vs. element for Y
        return [
            Math.round((evt.clientX - rect.left) * scaleX),   // scale mouse coordinates after they have
            Math.round((evt.clientY - rect.top) * scaleY)     // been adjusted to be relative to element
        ]
    }
    mouseDown(e) {
        // this.log(-1, "mousedown", e)
        if (this.current_roi == null) {
            return
        }
        // if mouse is near enough to any of the edges
        // of the active bbox, start chaning the bbox
        // dimensions
        // const lis = this.getBBoxAbs([0.1, 0.1, 0.4, 0.4])
        // const [X0, Y0, X1, Y1] = this.getBBoxAbs([0.1, 0.1, 0.5, 0.5])
        const [X0, Y0, X1, Y1] = this.getBBoxAbs([
            this.current_roi.left,
            this.current_roi.top,
            this.current_roi.right,
            this.current_roi.bottom
            ])

        //const x = e.clientX - this.canvas_element.getBoundingClientRect().left;
        //const y = e.clientY - this.canvas_element.getBoundingClientRect().top;

        const [X, Y] = this.getMousePos(e)

        if (this.mouse_verbose) { this.log(-1, "mouseDown", X, Y) }

        if (this.drag_state < 1) { // new drag
            if      (Math.abs(X-X0) < 10 && Math.abs(Y-Y0) < 10) {
                if (this.mouse_verbose) { this.log(-1, "START! left up") }
                this.drag_state = 1
            }
            else if (Math.abs(X-X0) < 10 && Math.abs(Y-Y1) < 10) {
                if (this.mouse_verbose) { this.log(-1, "START! left down") }
                this.drag_state = 2
            }
            else if (Math.abs(X-X1) < 10 && Math.abs(Y-Y0) < 10) {
                if (this.mouse_verbose) { this.log(-1, "START! right up") }
                this.drag_state = 3
            }
            else if (Math.abs(X-X1) < 10 && Math.abs(Y-Y1) < 10) {
                if (this.mouse_verbose) { this.log(-1, "START! right down") }
                this.drag_state = 4
            }
            else if (X > X0 && Y > Y0 && X < X1 && Y < Y1) {
                if (this.mouse_verbose) { this.log(-1, "START! whole box") }
                this.drag_state = 5
                this.coord_save = [X, Y]
            }
        } // new drag
    }

    mouseMove(e) {
        // this.log(-1, "mousemove")
        if (this.current_roi == null) {
            return
        }
        if (this.drag_state > 0) { // DRAG STATE ON
            //this.log(-1, "mouseMove")
            var [X, Y] = this.getMousePos(e)
            // this.log(-1, X, Y)
            const x = this.getRelX(X)
            const y = this.getRelY(Y)

            const [X0, Y0, X1, Y1] = this.getBBoxAbs([
                this.current_roi.left,
                this.current_roi.top,
                this.current_roi.right,
                this.current_roi.bottom
            ])

            // console.debug(X0, Y0)

            if (this.drag_state == 1) {
                if (this.mouse_verbose) { this.log(-1, "DRAG! left up") }
                if ((X1 - X) >= 5) {
                    this.current_roi.left = x
                }
                if ((Y1 - Y) >= 5) {
                    this.current_roi.top = y
                }
            }
            else if (this.drag_state == 2) {
                if (this.mouse_verbose) { this.log(-1, "DRAG! left down") }
                if ((X1 - X) >= 5) {
                    this.current_roi.left = x
                }
                if ((Y - Y0) >= 5) {
                    this.current_roi.bottom = y
                }
            }
            else if (this.drag_state == 3) {
                if (this.mouse_verbose) { this.log(-1, "DRAG! right up") }
                if ((X - X0) >= 5) {
                    this.current_roi.right = x
                }
                if ((Y1 - Y) >= 5) {
                    this.current_roi.top = y
                }
            }
            else if  (this.drag_state == 4) {
                if (this.mouse_verbose) { this.log(-1, "DRAG! right down") }
                if ((X - X0) >= 5) {
                    this.current_roi.right = x
                }
                if ((Y - Y0) >= 5) {
                    this.current_roi.bottom = y
                }
            }
            else if (this.drag_state == 5) {
                if (this.mouse_verbose) { this.log(-1, "DRAG! whole box") }
                const [X0, Y0] = this.coord_save
                if (this.mouse_verbose) { this.log(-1, "SAVED:", X0, Y0) }
                if (this.mouse_verbose) { this.log(-1, "NEW:", X, Y) }
                const dx = this.getRelDiffX(X - X0)
                const dy = this.getRelDiffY(Y - Y0)
                if (this.mouse_verbose) { this.log(-1, "dx, dy", dx, dy) }
                this.current_roi.left += dx
                this.current_roi.right += dx
                this.current_roi.top += dy
                this.current_roi.bottom += dy
                this.coord_save = [X, Y]
            }
            this.redraw()
        } // DRAG STATE ON
    }

    mouseUp(e) {
        // this.log(-1, "mouseUp")
        if (this.current_roi == null) {
            return
        }
        const [X, Y] = this.getMousePos(e)
        // this.log(-1, X, Y)
        if (this.drag_state > 0) { // DRAG STOP
            if (this.drag_state == 1) {
                if (this.mouse_verbose) { this.log(-1, "STOP! left up") }
            }
            else if (this.drag_state == 2) {
                if (this.mouse_verbose) { this.log(-1, "STOP! left down") }
            }
            else if (this.drag_state == 3) {
                if (this.mouse_verbose) { this.log(-1, "STOP! right up") }
            }
            else if  (this.drag_state == 4) {
                if (this.mouse_verbose) { this.log(-1, "STOP! right down") }
            }
            else if  (this.drag_state == 5) {
                if (this.mouse_verbose) { this.log(-1, "STOP! whole box") }
            }
            this.drag_state = 0
            if (this.mouse_verbose) { this.log(-1, "STOP! new bbox:", this.current_roi) }
            // this.$emit("bbox_edit", this.current_roi)
        } // DRAG STOP
    }


} // VideoCanvas

export { VideoCanvas }

