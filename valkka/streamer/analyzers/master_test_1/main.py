from valkka.streamer.multiprocess.master import MasterProcess as MasterProcess_
import time

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
            self.predictor = YOLO('yolov8n.pt')
        except Exception as e:
            self.logger.critical("predictor instatiation failed with %s", e)
            self.predictor = None

    def handleFrame__(self, frame, meta, fd):
        self.logger.debug("handleFrame__ : got frame %s", frame.shape)
        if self.predictor is None:
            self.logger.debug("handleFrame__ : no predictor")
            return
        t0=time.time()
        lis = self.predictor(frame)
        dt=time.time()-t0
        self.logger.debug("handleFrame__ : inference took %s ms", dt*1000)
        if dt > 0.5:
            self.logger.critical("handleFrame__ : your neural net detector is way too slow and will clog your pipeline")
        try:
            res_=self.predictor(frame)[0]
        except Exception as e:
            self.logger.critical("predictor failed with %s", e)
            return
        self.logger.debug("handleFrame__ : found objects: %s", tags)
        names=res_.names # always the same stuff..
        cls_=np.array(res_.boxes.cls, dtype=int).tolist()
        tags = [names[cl] for cl in cls_] # list of names of detected objects
        bboxes=res_.boxes.xyxyn # bboxes in relative coordinates
        lis=[]
        for i, cl in enumerate(cls_):
            bbox=bboxes[i]
            lis.append([
                tags[i],
                bbox[0].item(),
                bbox[1].item(),
                bbox[2].item(),
                bbox[3].item()
            ])
        obj = {
            "detections" : lis
        }
        # sends a message to the correct client:
        server = self.data_server_by_client_fd[fd]
        server.pushObject(obj)
