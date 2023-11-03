import { Widget, Signal } from '../lib/base/widget.js';

// *** MP4 Box manipulation functions ***
// taken from here: https://stackoverflow.com/questions/54186634/sending-periodic-metadata-in-fragmented-live-mp4-stream/

function toInt(arr, index) { // From bytes to big-endian 32-bit integer.  Input: Uint8Array, index
    var dv = new DataView(arr.buffer, 0);
    return dv.getInt32(index, false); // big endian
}

function toString(arr, fr, to) { // From bytes to string.  Input: Uint8Array, start index, stop index.
    // https://developers.google.com/web/updates/2012/06/How-to-convert-ArrayBuffer-to-and-from-String
    return String.fromCharCode.apply(null, arr.slice(fr,to));
}

function getBox(arr, i) { // input Uint8Array, start index
    return [toInt(arr, i), toString(arr, i+4, i+8)]
}

function getSubBox(arr, box_name) { // input Uint8Array, box name
    var i = 0;
    let res = getBox(arr, i);
    let main_length = res[0]; // var name = res[1]; // this boxes length and name
    i = i + 8;
    
    var sub_box = null;
    
    while (i < main_length) {
        let res = getBox(arr, i);
        let l = res[0]; let name = res[1];
        
        if (box_name == name) {
            sub_box = arr.slice(i, i+l)
        }
        i = i + l;
    }
    return sub_box;
}

function hasFirstSampleFlag(arr) { // input Uint8Array
    // [moof [mfhd] [traf [tfhd] [tfdt] [trun]]]
    
    let traf = getSubBox(arr, "traf");
    if (traf==null) { return false; }
    
    let trun = getSubBox(traf, "trun");
    if (trun==null) { return false; }
    
    // ISO/IEC 14496-12:2012(E) .. pages 5 and 57
    // bytes: (size 4), (name 4), (version 1 + tr_flags 3)
    let flags = trun.slice(10,13); // console.log(flags);
    let f = flags[1] & 4; // console.log(f);
    return f == 4;
}


class Streamer extends Widget {
    
    constructor(id, ws_adr) {
        super(null);
        this.id = id; // id of an HTML "video" element
        this.ws_adr = ws_adr;
        this.createElement();
        this.createState();
    }
    // UP: signals
    createSignals() { // called automagically by super() in the ctor
        this.signals.video_element = new Signal();
        //carries the HTML VideoElement
        //emitted once the VideoElement is ready
        this.signals.offset = new Signal(); // carries current offset from the head
    }
    // IN: slots
    seek_slot(secs) { // relative seek stream +/- secs fw/bw
        // this.log(-1, this.counter)
        if (this.counter >= 20) { // got at least some packets
            this.seek(secs) // checks value and sets this.target_dt
        }
    }
    createState() {
        // set mimetype and codec
        this.mimeType = "video/mp4";
        this.codecs = "avc1.4D401F"; // not needed // yes it is .. chrome requires
        this.codecPars = this.mimeType+';codecs="'+this.codecs+'"';
        // this.codecPars = mimeType;
        this.load_callback_active = false; // is the sourceBuffer updateend callback active nor not
        // create media source instance
        this.ms = new MediaSource();
        this.ms.addEventListener('sourceopen', () => {
            this.opened()}, false);
        this.livestream.src = window.URL.createObjectURL(this.ms);
        /* // the relevant objects:
        <video> element // https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement
            .duration (read-only)
            .fastSeek (only in firefox)
            .currentTime (set/get)
            .src
                MediaSource // https://developer.mozilla.org/en-US/docs/Web/API/MediaSource
                    .duration(int) (read/write)
                    .addSourceBuffer(codecpars) -> sourceBuffer
            
        sourceBuffer // https://developer.mozilla.org/en-US/docs/Web/API/SourceBuffer
        */
        // queue for incoming media packets
        // packets are queued here before pushing them to the media source buffer
        // in fact, sourceBuffer does a callback that pulls packets from this queue
        // when it's ready for more:
        this.queue = [];
        this.queue_sum = 0;
        this.queue_max = 1024*1024*10; // max N MB buffer
        
        this.not_yet_started = true;
        // this.max_lag = 3; // maximum lag allowed when in greedy mode
        this.target_dt = 0;
            

        // this.livestream = null; // the HTMLMediaElement (i.e. <video> element)
        this.ws = null; // websocket
        this.counter = 0;
        this.dropcounter = 0;
        this.seeked = false; // have have seeked manually once ..
        this.sourceBuffer = null; // SourceBuffer instance
        this.passthrough = 0;
    }
    opened() {
        this.log(0, "Streamer: opened")
        this.sourceBuffer = this.ms.addSourceBuffer(this.codecPars);
        
        // https://developer.mozilla.org/en-US/docs/Web/API/source_buffer/mode
        // var myMode = this.sourceBuffer.mode;
        this.sourceBuffer.mode = 'sequence';
        // source_buffer.mode = 'segments';
        this.sourceBuffer.addEventListener("updateend",this.loadPacket.bind(this));

        this.ws = new WebSocket(this.ws_adr)
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = (event) => {
            this.pushPacket.bind(this)(event.data); // -> may call loadPacket
        }

        this.log(0, "Streamer: emitting", this.livestream)
        this.signals.video_element.emit(this.livestream)
    }
    createElement() {
        // get reference to video element
        this.livestream = document.getElementById(this.id);
        this.livestream.addEventListener('error', (e) => {this.err(e)});
        this.livestream.addEventListener('play', this.log.bind(this)(0, "LIVESTREAM PLAY"));
        this.livestream.addEventListener('pause', this.log.bind(this)(0, "LIVESTREAM PAUSE"));
        this.livestream.addEventListener('playing', this.log.bind(this)(0, "LIVESTREAM PLAYING"));
        this.livestream.addEventListener('seeked', this.log.bind(this)(0, "LIVESTREAM SEEKED"));
        this.livestream.addEventListener('seeking', this.log.bind(this)(0, "LIVESTREAM SEEKING"));
        this.livestream.addEventListener('stalled', this.log.bind(this)(0, "LIVESTREAM STALLED"));
        this.livestream.addEventListener('suspend', this.log.bind(this)(0, "LIVESTREAM SUSPEND"));
        this.livestream.addEventListener('waiting', this.log.bind(this)(0, "LIVESTREAM WAITING"));
    }
    // internal methods
    pushPacket(arr) {
        this.log(-2, "got", arr.byteLength, "bytes");
        // normally data is just appended to queue where it is being read by loadPacket
        this.queue_sum += arr.byteLength;
        while ((this.queue_sum >= this.queue_max) && (this.queue.length > 0)) {
            // of queue size has reached max allowed bytes, remove packet from the beginning
            let out=this.queue.shift(); // remove from beginning
            if ( ((this.dropcounter == 0) || (this.dropcounter % 200 == 0)) ) {
                this.log(-2, "queue overflow: removed", out.byteLength, "bytes")
            }
            this.queue_sum -= out.byteLength;
        }
        this.queue.push(arr); // add to end

        if (!this.load_callback_active) {
            // calling loadPacket -> sourceBuffer.appendBuffer
            // for the first time or queue was empty
            // at some moment
            this.loadPacket();
        }
        
        if ((this.counter > 20) && this.not_yet_started) {
            this.not_yet_started = false;
            if (this.livestream.paused) {
                this.livestream.play();
            }
        }
    }
    
    loadPacket() { 
        // callback: called when sourceBuffer is ready for more
        // but for the first time and when queue didn't have
        // anything to feed, we need to call this manually
        // WARNING: whatever manipulation you do to sourceBuffer or ms (MediaSource), you need
        // to exit this callback immediately
        if (!this.sourceBuffer.updating) { // really, really ready
            // this.log(-2, "loadPacket: updating")
            if (this.sourceBuffer.buffered.length > 0) {
                const dt = this.sourceBuffer.buffered.end(0) - this.sourceBuffer.buffered.start(0); // Index or size is negative or greater than the allowed amount
                if (dt > 60) { // (**) drop old stuff from the sourceBuffer
                    let dt_ = 10; // drop this many secs
                    this.log(-2, "removing from", this.sourceBuffer.buffered.start(0), "to", this.sourceBuffer.buffered.start(0)+dt_);
                    this.sourceBuffer.remove(this.sourceBuffer.buffered.start(0), this.sourceBuffer.buffered.start(0)+dt_);
                    return;
                }
            } // sourceBuffer.buffered.length > 0
            if (this.queue.length>0) {
                var inp = this.queue.shift(); // pop from the beginning
                this.queue_sum -= inp.byteLength;
                this.log(-3, "queue PULL:", this.queue.length);
                var view = new Uint8Array(inp);
                this.log(-3, "                        writing buffer with", view[0], view[1], view[2], view[3], view[4]);
                let res = getBox(view, 0);
                let main_length = res[0]; let name = res[1]; // this boxes length and name
                // pass ftyp and moov, other packets only after the special moof packet has been received
                if ((name=="ftyp") && (this.passthrough==0)) {
                    this.passthrough = this.passthrough + 1;
                    this.log(-2, "got ftyp");
                }
                else if ((name=="moov") && (this.passthrough==1)) {
                    this.passthrough = this.passthrough + 1;
                    this.log(-2, "got moov");
                }
                else if ((name=="moof") && (this.passthrough==2)) { // name=="moof" and passthrough==false
                    if (hasFirstSampleFlag(view)) {
                        this.passthrough = this.passthrough + 1;
                        this.log(-2, "got that special moof");
                    }
                    else {
                        return;
                    }
                }
                else if (this.passthrough < 3) { // wait for the ftyp-moov-moof sequence
                    return;
                }
                try {
                    this.sourceBuffer.appendBuffer(inp)
                } catch (error) {
                    this.error(error);
                    // throw(error);
                    this.sourceBuffer.removeEventListener("updateend", this.loadPacket);
                    this.load_callback_active = true;
                    return;
                };
                this.load_callback_active = true; // we added stuff into the buffer -> now this callback will be automagically called by the media source
                this.counter = this.counter + 1;
                if ((this.counter % 50) == 0) {
                    if (Math.abs(this.livestream.currentTime - this.livestream.buffered.end(0) - this.target_dt) > 1.5) {
                        this.log(-1, "correction seek from", this.livestream.currentTime, "to dt", this.target_dt) 
                        this.seek(this.target_dt)
                    }
                    this.signals.offset.emit(this.livestream.currentTime - this.livestream.buffered.end(0));
                    this.log(-2, `sourceBuffer: ${this.counter} packets /`
                    + ` Range ${this.sourceBuffer.buffered.start(0)} -> ${this.sourceBuffer.buffered.end(0)} /` 
                    + ` Current: ${this.livestream.currentTime} /`
                    + ` MS duration: ${this.ms.duration}`
                    );
                }
            } // if queue.length>0
            else { 
                // the queue runs empty, so the next packet is fed directly
                // we're not getting this callback again
                // --> so pushPacket will push data directly to media streamer
                this.load_callback_active = false;
            }
        } // really, really ready
        else { // so it was not?
        }
    } // loadPacket

    seek(secs) {
        // secs: seek - or + relative to current time
        var newTime = this.livestream.currentTime + secs
        if (newTime > this.livestream.buffered.end(0)) { // past head
            this.log(-1, "seek: past head")
            newTime = this.livestream.buffered.end(0)
        }
        else if (newTime < this.livestream.buffered.start(0)) { // below min time
            newTime = this.livestream.buffered.start(0)
            this.log(-1, "seek: before start")
        }
        // set the time
        this.livestream.currentTime = newTime
        this.target_dt = newTime - this.livestream.buffered.end(0);
        this.log(-1,"seek req to", secs, "corrected to", this.target_dt);
        this.log(-1, "seeked to ", newTime);
        this.signals.offset.emit(this.target_dt);
    }

} // widget

export { Streamer }

