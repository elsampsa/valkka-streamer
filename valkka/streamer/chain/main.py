import time, sys, logging
from uuid import uuid1
from valkka import core
from valkka.streamer.singleton import event_fd_group_1


class MainBranch:
    """Main branch filterchain as hierarchical list:

    ::

        (LiveThread:livethread)
            main_fork
                A: (AVThread:avthread)
                        decoder_fork (on-demand fork)
                B: {FragMP4MuxFrameFilter:fragmp4muxer}
                        {GateFrameFilter:fragmp4_gate}
                            {FragMP4ShmemFrameFilter:fragmp4shmem}
    
    """
    def __init__(self, address: str = None, slot: int = None, livethread = None, camname = None, vaapi = False):
        """
        :param address: rtsp address (str)
        :param slot: slot number (int)
        :param livethread: a running LiveThread
        """
        assert(address is not None)
        assert(slot is not None)
        assert(livethread is not None)
        assert(camname is not None)

        self.logger = logging.getLogger("filterchain") # as per ini file

        self.closed = False
        self.address = address
        self.slot = slot
        self.camname = camname
        _, self.fragmp4_event = event_fd_group_1.reserve()

        id_str = str(id(self))

        # shared memory definitions 
        # frag-MP4 shmem
        self.fragmp4_shmem_buffers = 10 # 10 element in the ring-buffer
        self.fragmp4_shmem_name = id_str + "_fragmp4" # unique name identifying the shared memory
        self.fragmp4_shmem_cellsize = 1024*1024*2 # max size for each MP4 fragment (2 MB just in case ..)
        # ..I-frames for 2K+ streams can be 100KB+ in size
        # 10 * 2 MB = 20 MB per filterchain .. 10 cameras => 200MB of shmem

        assert(livethread is not None)
        self.livethread = livethread
        # NOTE: livethread need not to be running yet

        """Create filterchain strictly from end-to-beginning
        """
        # Mux branch (B)
        self.fragmp4_shmem = core.FragMP4ShmemFrameFilter(self.fragmp4_shmem_name, self.fragmp4_shmem_buffers, self.fragmp4_shmem_cellsize)
        self.fragmp4_shmem.useFd(self.fragmp4_event)
        self.fragmp4_gate = core.GateFrameFilter("fragmp4_gate", self.fragmp4_shmem)
        self.fragmp4_gate.unSet()
        self.fragmp4_muxer = core.FragMP4MuxFrameFilter("fragmp4_muxer", self.fragmp4_gate)
        self.fragmp4_muxer.deActivate()

        # decoding branch A
        self.decode_fork = core.ForkFrameFilterN("decode_fork_"+str(self.slot))
        if vaapi:
            self.avthread = core.VAAPIThread("avthread_"+str(self.slot), self.decode_fork)
        else:
            self.avthread = core.AVThread("avthread_"+str(self.slot), self.decode_fork)
        self.avthread_in = self.avthread.getFrameFilter()

        # main branch
        self.main_fork = core.ForkFrameFilterN("main_fork_"+str(self.slot))

        # connect branches
        self.main_fork.connect("fragmp4_terminal_"+str(self.slot), self.fragmp4_muxer)
        self.main_fork.connect("decoder_"+str(self.slot), self.avthread_in)

        self.ctx = core.LiveConnectionContext(core.LiveConnectionType_rtsp, 
            self.address, 
            self.slot, 
            self.main_fork # stream writes to main_fork
        )
        self.ctx.msreconnect=10000 # if nothing heard of the stream in 10 secs, reconnect
        self.ctx.request_tcp=True # stream using tcp instead of udp
        self.ctx.reordering_time=1000 # buffering of 1 sec
        self.ctx.time_correction=core.TimeCorrectionType_smart
        # self.ctx.time_correction=core.TimeCorrectionType_dummy
    
    def __call__(self):
        self.livethread.registerStreamCall(self.ctx)
        self.livethread.playStreamCall(self.ctx)
        self.avthread.startCall()
        self.avthread.decodingOnCall()
        
    def connectYUV(self, name = None, target_filter = None):
        assert name is not None
        assert target_filter is not None
        self.decode_fork.connect(name, target_filter)

    def disconnectYUV(self, name):
        self.decode_fork.disconnect(name)
    
    def getFMP4ShmemPars(self):
        return {
            "camname" : self.camname,
            "name" : self.fragmp4_shmem_name,
            "n_ringbuffer" : self.fragmp4_shmem_buffers,
            "n_size" : self.fragmp4_shmem_cellsize,
            "ipc_index" : event_fd_group_1.asIndex(self.fragmp4_event),
            "slot" : self.slot
        }


    def activateFMP4ShmemChannel(self):
        self.logger.debug("filterchain: %s: fmp4 activate", self.slot)
        self.fragmp4_gate.set()
        self.fragmp4_muxer.activate()
        self.fragmp4_muxer.sendMeta()
        self.logger.debug("filterchain: %s: fmp4 activated", self.slot)
        

    def deactivateFMP4ShmemChannel(self):
        self.logger.debug("filterchain: %s: fmp4 deactivate", self.slot)
        self.fragmp4_gate.unSet()
        self.fragmp4_muxer.deActivate()
        self.logger.debug("filterchain: %s: fmp4 deactivated", self.slot)
        

    def close(self):
        """NOTE: All active shmem clients should be closed before this
        """
        self.logger.debug("filterchain: %s: close: deactivate fmp4", self.slot)
        # self.main_fork.disconnect("fragmp4_terminal_"+str(self.slot)) # not needed, really
        self.deactivateFMP4ShmemChannel()
        self.fragmp4_muxer.deActivate()
        event_fd_group_1.release(self.fragmp4_event)

        self.logger.debug("filterchain: %s: close: stop stream", self.slot)
        self.livethread.stopStreamCall(self.ctx)
        self.logger.debug("filterchain: %s: close: dereg stream", self.slot)
        self.livethread.deregisterStreamCall(self.ctx)
        # WARNING: .. that call will be executed in the
        # separately running thread - asap, but it might take
        # some time.  Meanwhile, gargabe collection might kick in, removing
        # the filters where the livethread is writing its stuff
        # if we'd be waiting for livethread stop, then this would be ok
        self.logger.debug("filterchain: %s: close: wait livethread ready", self.slot)
        self.livethread.waitReady()
        self.logger.debug("filterchain: %s: avthread stop", self.slot)
        self.avthread.stopCall()
        self.closed = True
        self.logger.debug("filterchain: %s: closed", self.slot)

    def __del__(self):
        self.logger.debug("filterchain: %s: garbage collect", self.slot)
        if not self.closed:
            self.close()
