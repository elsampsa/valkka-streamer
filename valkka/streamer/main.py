import importlib, traceback
from valkka import core
from valkka.multiprocess import MainContext, MessageProcess, MessageObject, safe_select
from valkka.streamer.tools import getDataPath
from valkka.streamer.chain import MainBranch, RGB24Branch
from valkka.streamer.multiprocess import MasterProcess, ClientProcess, \
    MultiServerProcess, NGWrapper



class Manager(MainContext):

    def __init__(self, args = None, cfg = None):
        """args: namespace, cfg: nested dict
        """
        # self.n_workers = n_workers
        self.timeout = 2.0
        self.livethread = core.LiveThread("livethread")
        self.closed = False
        self.args = args
        self.cfg = cfg
        self.filterChainFromConfig()
        super().__init__() # TODO: DOCS: this should always be the last line of __init__


    def filterChainFromConfig(self):
        """Create filterchains from the dictionary, created from the yaml file

        ::

            name: mummocamera1
            address: rtsp://admin:12345@10.0.0.7
            use: true
            ms_pass: 100
            interpolate: [300,300] # w, h
            detector: "detector-name-1"
            ws_stream: true

        """
        cc = 1
        self.main_branches_by_name = {}
        for stream in self.cfg["streams"]:
            if not stream["use"]:
                continue
            main_branch = MainBranch(address = stream["address"],
                slot = cc, livethread = self.livethread, camname = stream["name"],
                vaapi = self.cfg["vaapi"]
            )
            cc += 1
            self.main_branches_by_name[stream["name"]] = main_branch


    def detectorsFromConfig(self):
        """Associate analyzer processes to cameras
        """
        self.logger.debug("associating analyzer processes to cameras")
        for stream in self.cfg["streams"]:
            if "detector" in stream: # this stream has an associated detector
                # get the main branch
                name = stream["name"]
                try:
                    main_branch = self.main_branches_by_name[name]
                except KeyError:
                    continue # that camera is not in use..
                # get detector name and associated running analyzer process
                try:
                    detector_name=stream["detector"]
                except KeyError:
                    continue # no detector for this camera..
                try:
                    p = self.avail_process_cache[detector_name].pop(0)
                except KeyError:
                    self.logger.critical("no such process type %s ?", detector_name)
                    traceback.print_exc()
                    continue
                except IndexError:
                    self.logger.critical("no more processes of type %s avail ?", detector_name)
                    traceback.print_exc()
                    continue
                rgb24_branch = RGB24Branch(image_interval = stream["ms_pass"],
                    width = stream["interpolate"][0],
                    height = stream["interpolate"][1]
                )
                main_branch.connectYUV(name = detector_name,
                    target_filter = rgb24_branch() 
                )
                pars = rgb24_branch.getPars()
                p.activateRGB24Client(
                    **pars
                )
                # uuid could identify for example a bbox, etc. now it is just the camera name
                p.setUUID(name)
                if "detector_pars" in stream:
                    p.setPars(**stream["detector_pars"])
                # lets save the filterchain branch to the
                # associated multiprocess as a member :)
                p.my_branch=rgb24_branch
                self.logger.debug("process %s of type %s associated to camera %s", p, detector_name, name)

                if hasattr(p, "master_process_name"):
                    self.logger.debug("process %s of type %s requires a master process %s", 
                        p, detector_name, p.master_process_name)
                    try:
                        master = self.avail_master_process_cache[p.master_process_name].pop(0)
                    except KeyError:
                        self.logger.critical("no such master process type %s", p.master_process_name)
                        continue
                    except IndexError:
                        self.logger.critical("no more processes of type %s avail", p.master_process_name)
                        continue
                    master.registerClientProcess(p)
                    if not master.full():
                        # this master process can still support more clients, so keep it in the list
                        self.avail_master_process_cache[p.master_process_name].insert(0, master)

                # tell websocket server to listen to results
                # from this analyzer process
                # MultiServer.registerRGBProcess calls
                # RGB24Processes' getDataShmemPars()
                self.multiserver.registerRGBProcess(p)


    def startProcesses(self):
        """Start all multiprocesses here (called before starting threads)
        """
        self.logger.debug("startProcesses:")

        if self.cfg["nginx"]["use"]:
            self.logger.warning("using standalone nginx process")
            if "path" not in self.cfg["nginx"]:
                self.cfg["nginx"]["path"] = getDataPath()
            print("\nHTTP SERVED AT",f'http://localhost:{self.cfg["nginx"]["port"]}',"\n")
            self.nginx = NGWrapper(self.cfg["nginx"])
        else:
            self.nginx = None

        self.multiserver = MultiServerProcess()
        self.multiserver.ignoreSIGINT()

        # lists of all (avail/non-avail) analyzer processes (per process type):
        self.process_cache = {} # key: process name, value: list
        # lists of all avail (i.e. idle) analyzer processes (per process type):
        self.avail_process_cache = {} # key: process name, value: list
        # same stuff for main processes:
        self.master_process_cache = {} # key: process name, value: list
        self.avail_master_process_cache = {} # key: process name, value: list
        self.process_by_pipe = {} # analyzer processes here
        self.read_pipes = [self.aux_pipe_read] # pipes / file descriptors to listen to

        for process in self.cfg["processes"]:
            name=process["name"]
            module_name = f"valkka.streamer.analyzers.{name}.main"
            class_name = "AnalyzerProcess"
            # Dynamically import the module & retrieve the class from the module
            try:
                module = importlib.import_module(module_name)
                class_ = getattr(module, class_name)
            except Exception as e:
                self.logger.critical("Could not import %s from module %s", class_name, module_name)
                traceback.print_exc()
                continue
            n=process["n_cache"]
            self.process_cache[name] = []
            self.avail_process_cache[name] = []
            for i in range(n):
                p = class_(
                    server_img_width = process["max_width"],
                    server_img_height = process["max_height"],
                    datasize = process["datasize"]
                )
                p.ignoreSIGINT()
                p.start()
                self.logger.debug("started multiprocess %s", p)
                self.process_cache[name].append(p)
                self.avail_process_cache[name].append(p)
                
        """same for master processes
        """
        for process in self.cfg["master_processes"]:
            name=process["name"]
            max_clients=process["max_clients"]
            module_name = f"valkka.streamer.analyzers.{name}.main"
            class_name = "MasterProcess"
            # Dynamically import the module & retrieve the class from the module
            try:
                module = importlib.import_module(module_name)
                class_ = getattr(module, class_name)
            except Exception as e:
                self.logger.critical("Could not import %s from module %s", class_name, module_name)
                continue
            n=process["n_cache"]
            self.master_process_cache[name] = []
            self.avail_master_process_cache[name] = []
            for i in range(n):
                p = class_(
                    max_clients=max_clients,
                    datasize = process["datasize"]
                )
                p.ignoreSIGINT()
                p.start()
                self.logger.debug("started multiprocess %s", p)
                self.master_process_cache[name].append(p)
                self.avail_master_process_cache[name].append(p)

        self.multiserver.start()
        port = self.cfg["ws_server"]["port"]
        self.multiserver.startWServer(port=port)
        if self.nginx:
            self.nginx.start()
        self.logger.info("startProcesses: all multiprocesses running")

        self.detectorsFromConfig()


    def startThreads(self):
        self.logger.debug("startThreads:")
        self.livethread.startCall()
        for name, main_branch in self.main_branches_by_name.items():
            main_branch() # starts MainBranch threads


    def close(self):
        """Stop all threads and multiprocesses here
        """
        if self.closed:
            return
        self.logger.debug("close: stopping processes")
        self.multiserver.requestStop()
        self.multiserver.waitStop()
        if self.nginx:
            self.nginx.stop()

        for key, lis in self.process_cache.items():
            self.logger.debug("stopping processes of type %s", key)
            for p in lis:
                p.requestStop()
            for p in lis:
                p.waitStop()
                self.logger.debug("stopped process %s", p)
                
        for key, lis in self.master_process_cache.items():
            self.logger.debug("stopping processes of type %s", key)
            for p in lis:
                p.requestStop()
            for p in lis:
                p.waitStop()
                self.logger.debug("stopped process %s", p)

        self.logger.debug("close: processes stopped")
        self.logger.debug("close: stopping threads")
        for name, main_branch in self.main_branches_by_name.items():
            main_branch.close()
        self.livethread.stopCall()
        self.closed = True

    def __call__(self):
        self.loop = True
        """Register all fmp4 channels into the websocket server
        """
        for name, main_branch in self.main_branches_by_name.items():
            self.multiserver.registerFMP4Pars(
                **main_branch.getFMP4ShmemPars()
            )

        self.logger.debug("starting main loop")
        while self.loop:
            try:
                rlis = [self.aux_pipe_read]
                rlis.append(self.multiserver.getPipe())
                reads, writes, others = safe_select(
                    rlis, [], [], timeout=self.timeout)
            except KeyboardInterrupt:
                self.logger.warning("SIGTERM or CTRL-C: will exit asap")
                self.loop = False
                continue
            if len(reads) < 1: # reading operation timeout
                self.logger.debug("still alive")
                continue
            for r in reads:
                if r is self.aux_pipe_read:
                    self.logger.critical("debug mode exit")
                    self.loop = False
                    continue
                elif r is self.multiserver.getPipe():
                    obj = r.recv()
                    self.handleMultiServerMessage__(obj)
                else:
                    try:
                        p = self.process_by_pipe[r]
                    except KeyError:
                        self.logger.critical("unknown pipe %s", r)
                        continue
                    obj = r.recv()
                    self.logger.debug("got message %s", obj)
                    self.handleMessage__(p, obj)
        self.close()
        self.logger.debug("bye!")


    def handleMultiServerMessage__(self, msg: MessageObject):
        self.logger.debug("got multiserver message %s", msg)
        """

        ::

            msg.command
            msg dict:
                camname:

        """
        if msg.command in ["fmp4-start", "fmp4-stop"]:
            camname = msg["camname"]
            try:
                main_branch = self.main_branches_by_name[camname]
            except KeyError:
                self.logger.warning("no such cam %s", camname)
                return
        if msg.command == "fmp4-start":
            # websocket has been requested from MultiServer
            main_branch.activateFMP4ShmemChannel()
        elif msg.command == "fmp4-stop":
            # websocket has been closed at MultiServer
            main_branch.deactivateFMP4ShmemChannel()


    def handleMessage__(self, p: MessageProcess, msg: MessageObject):
        pass


if __name__ == "__main__":
    """testing
    """
    import logging, time, asyncio
    from websockets.sync.client import connect
    from valkka.streamer.tools import YamlCLI, getDataFile

    cli = YamlCLI(default_yaml=getDataFile("example.yaml"))
    args, cfg = cli()
    # Manager.formatLogger(logging.DEBUG) # of course in a real app, in some other way
    # MultiServerProcess.formatLogger(logging.DEBUG)
    manager = Manager(args=args, cfg=cfg)
    manager.runAsThread()
    print("running manager for some secs")
    time.sleep(1)
    print("testing ws streaming")

    name=cfg["streams"][0]["name"]
    port=cfg["ws_server"]["port"]

    def readsome():
        cc=0
        adr=f"ws://localhost:{port}/ws/stream/{name}"
        print("connecting to", adr)
        with connect(adr) as websocket:
            while cc < 10:
                print("waiting for packet", cc)
                message = websocket.recv()
                print(f"Received {len(message)} bytes")
                cc+=1
        print("closing websocket")

    readsome()

    time.sleep(10)

    print("stopping manager")
    manager.stopThread()
    print("bye!")

