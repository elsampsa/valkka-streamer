from valkka.multiprocess import MessageObject
from valkka.streamer.multiprocess.client import ClientProcess

class AnalyzerProcess(ClientProcess):

    def __init__(self, 
        mstimeout = 1000, 
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
            datasize = datasize,
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
        self.prev_status = False


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
        movement = self.detector(frame)
        if movement != self.prev_status:
            if movement:
                self.logger.debug("handleFrame__ : yikes! got some creepy (new) movement")
                # send a message to the websocket server
                self.data_server.pushObject({
                    "status" : "something moving!"
                })
            else:
                self.logger.debug("handleFrame__ : all (again) still")
                self.data_server.pushObject({
                    "status" : "all (again) still.."
                })
        self.prev_status = movement


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

