from valkka.multiprocess import MessageObject
from valkka.streamer.multiprocess.client import ClientProcess

class AnalyzerProcess(ClientProcess):

    master_process_name ="master_test_1"

    def __init__(self, 
        mstimeout = 1000, # internal semaphore timeout
        server_img_width = 1920, 
        server_img_height = 1080,
        name = "test",
        datasize = 1024*1024*1,
        detector_pars = {"tolerance": 0.3}
        ):
        super().__init__(
            mstimeout=mstimeout,
            server_img_width = server_img_width, 
            server_img_height = server_img_height,
            datasize=datasize,
            name=name)
        self.detector_pars = detector_pars
        # print(">>>>", self.logger)
        # NOTE: the logger name (whose verbosity you can control in the yaml file)
        # is AnalyzerProcess.test (i.e. classname.name)


    def preRun__(self):
        super().preRun__()
        """All imports and instances that you will use in the "other side of the fork" / multiprocess,
        should be done in here (NOT in __init__)
        """
        from .detector import Detector
        self.detector = Detector(**self.detector_pars)


    def handleFrame__(self, frame, meta):
        self.logger.debug("handleFrame__ : got frame %s from slot %s", frame.shape, meta.slot)
        """metadata has the following members:
        size 
        width
        height
        slot
        mstimestamp
        """
        # send a message to the main process like this:
        # self.send_out__({})
        #
        # self.server.pushFrame(frame, meta.slot, meta.mstimestamp); return # DEBUG
        #
        movement = self.detector(frame)
        if movement:
            self.logger.debug("handleFrame__ : movement - will fw the frame to master process")
            # use RGB24SERVER to send a frame to the master process:
            # send a frame to master process (i.e. yolo and the like), only after detecting movement
            self.server.pushFrame(frame, meta.slot, meta.mstimestamp)
        else:
            self.logger.debug("handleFrame__ : all (again) still")


    def handleMessage__(self, obj):
        """Receives messages from the master process
        """
        self.logger.debug("handleMessage__ : got a message from master %s", obj)
        # send a message to the websocket server
        self.data_server.pushObject(obj)

    def c__setPars(self, **pars):
        if "tolerance" in pars:
            self.logger.debug("setting tolerance to %s", pars["tolerance"])
            self.detector.setTolerance(
                pars["tolerance"]
            )

    def setPars(self, **pars):
        self.logger.debug("setPars: %s", pars)
        self.sendMessageToBack(MessageObject(
            "setPars",
            **pars
        ))

