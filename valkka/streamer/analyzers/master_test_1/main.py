from valkka.streamer.multiprocess.master import MasterProcess as MasterProcess_
import time
import numpy as np
from PIL import Image

class MasterProcess(MasterProcess_):

    def __init__(self,
            name = "test", 
            max_clients=5, 
            detector_pars = {},
            datasize=1024*1024*1,
            ):
        super().__init__(name = name, max_clients=max_clients, datasize=datasize)
        # --> logger: MasterProcess.test
        self.detector_pars = detector_pars
    

    def preRun__(self):
        super().preRun__()
        """All imports and instances that you will use in the "other side of the fork" / multiprocess,
        should be done in here (NOT in __init__)

        this *particular* example uses the awesome ultralytics yolov8
        https://docs.ultralytics.com/quickstart/#use-ultralytics-with-python
        but feel free to use ANY implementation/API you might have installed
        NOTE: with ultralytics, be carefull with the licensing terms
        """
        # from darknet.api2.predictor import get_YOLOv2_Predictor, get_YOLOv3_Predictor, get_YOLOv3_Tiny_Predictor
        try:
            from ultralytics import YOLO
            from valkka.streamer.tools import getDataFile

            self.predictor = YOLO(getDataFile('yolov8n.pt')) # saves into valkk/streamer/data
        except Exception as e:
            self.logger.critical("predictor instantiation failed with %s", e)
            self.predictor = None
        # warmup
        self.predictor(np.random.randint(0,255,size=(640,640,3)))
        self.warn=False
        self.warn_cc=10
        # im=Image.open(getDataFile("cute/assets/dog.jpg")); self.debug_frame=np.array(im) # DEBUG


    def handleFrame__(self, frame, meta, fd):
        # self.logger.debug("handleFrame__ : got frame %s", frame.shape)
        # frame=self.debug_frame # DEBUG

        if self.predictor is None and self.warn:
            self.logger.critical("handleFrame__ : no predictor")
            self.warn=False
            return
        t0=time.time()
        lis = self.predictor(frame, verbose=False)
        dt=time.time()-t0
        # self.logger.debug("handleFrame__ : inference took %s ms", dt*1000)
        if dt > 0.5 and self.warn_cc>=0:
            self.logger.critical("handleFrame__ : your neural net detector is way too slow and will clog your pipeline")
            self.warn_cc-=1
        try:
            res_=self.predictor(frame)[0]
        except Exception as e:
            self.logger.critical("predictor failed with %s", e)
            return
        names=res_.names # always the same stuff..
        cls_=np.array(res_.boxes.cls, dtype=int).tolist()
        tags = [names[cl] for cl in cls_] # list of names of detected objects
        if len(tags) > 0: 
            self.logger.debug("handleFrame__ : dt: %s ms --> found objects: %s", dt*1000, tags)
        bboxes=res_.boxes.xyxyn # bboxes in relative coordinates
        lis=[]
        for i, cl in enumerate(cls_):
            bbox=bboxes[i]
            # bbox: xy, xy
            lis.append([
                tags[i],
                bbox[0].item(), # left
                bbox[2].item(), # right
                bbox[1].item(), # top
                bbox[3].item()  # bottom
            ])
        obj = {
            "detections" : lis
        }
        # sends a message to the correct client:
        server = self.data_server_by_client_fd[fd]
        server.pushObject(obj)
