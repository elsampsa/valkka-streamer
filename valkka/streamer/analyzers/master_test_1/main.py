from valkka.streamer.multiprocess.master import MasterProcess as MasterProcess_

class MasterProcess(MasterProcess_):

    def __init__(self, mstimeout = 1000, 
            name = "test", 
            max_clients=5, 
            detector_pars = {},
            datasize=1024*1024*1,
            ):
        super().__init__(mstimeout = mstimeout, name = name, max_clients=max_clients, datasize=datasize)
        # --> logger: MasterProcess.test
        self.detector_pars = detector_pars
    

    def preRun__(self):
        super().preRun__()
        """All imports and instances that you will use in the "other side of the fork" / multiprocess,
        should be done in here (NOT in __init__)

        this *particular* example uses a standalone yolov3 implementation:
        https://github.com/elsampsa/darknet-python
        but feel free to use ANY implementation/API you might have installed
        """
        # from darknet.api2.predictor import get_YOLOv2_Predictor, get_YOLOv3_Predictor, get_YOLOv3_Tiny_Predictor
        try:
            from darknet.api2.predictor import get_YOLOv3_Tiny_Predictor
            self.predictor = get_YOLOv3_Tiny_Predictor()
        except Exception as e:
            self.logger.critical("predictor instatiation failed with %s", e)
            self.predictor = None

    def handleFrame__(self, frame, meta, fd):
        self.logger.debug("handleFrame__ : got frame %s", frame.shape)
        if self.predictor is None:
            self.logger.debug("handleFrame__ : no predictor")
            return
        lis = self.predictor(frame) # list of object name strings
        self.logger.debug("handleFrame__ : found objects: %s", lis)
        obj = {
            "detections" : lis
        }
        # sends a message to the correct client:
        server = self.data_server_by_client_fd[fd]
        server.pushObject(obj)
