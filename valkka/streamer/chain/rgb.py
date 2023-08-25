import time, sys, logging
# from uuid import uuid1
from valkka import core
from valkka.streamer.singleton import event_fd_group_1


class RGB24Branch:
    """Implements the following filterchain:

    ::

        {IntervalFrameFilter: interval_filter} 
            {SwScaleFrameFilter: sws_filter}
                {RGBSharedMemFrameFilter: shmem_filter}

    """

    def __init__(self, image_interval=1000, width=1920, height=1080):
        # RGB shmem, etc.
        # define yuv=>rgb interpolation interval
        # so what shall we put here..!?  let's go 5 fps
        self.image_interval=image_interval  # YUV => RGB interpolation to the small size is done each 1000 milliseconds and passed on to the shmem ringbuffer
        # self.image_interval=200 # 5 fps
        # self.image_interval=500 # 2 fps
        # define rgb image dimensions

        # quarter of 1080p
        #self.width  =1920//4
        #self.height =1080//4

        # 1080p == 1K
        #self.width  =1920
        #self.height =1080

        # 2K
        #self.width = 2560 
        #self.height = 1440

        self.width = width
        self.height = height

        # posix shared memory
        # self.rgb_shmem_name = str(id(self)) + "_rgb" # This identifies posix shared memory - must be unique
        self.name = str(id(self)) + "_rgb" # This identifies posix shared memory - must be unique
        self.n = 10 # Size of the shmem ringbuffer

        # self.uuid = uuid1().hex
        # self.name = self.uuid
        _, self.event = event_fd_group_1.reserve()
        
        self.rgbshmem_filter = core.RGBShmemFrameFilter(
            self.name, 
            self.n,
            self.width, 
            self.height)
        self.sws_filter =core.SwScaleFrameFilter("sws_filter", self.width, self.height, self.rgbshmem_filter)
        self.interval_filter =core.TimeIntervalFrameFilter("interval_filter", 
            self.image_interval,
            self.sws_filter)

        self.rgbshmem_filter.useFd(self.event)


    def __call__(self):
        """Return terminal frame filter
        """
        return self.interval_filter


    def getPars(self):
        return {
            "name" : self.name,
            "n_ringbuffer" : self.n,
            "height" : self.height,
            "width" : self.width,
            "ipc_index" : event_fd_group_1.asIndex(self.event),
            # "slot" : self.slot
        }

    def close(self):
        event_fd_group_1.release(self.event)
