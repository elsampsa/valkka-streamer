import time, sys, asyncio, copy, logging, os, fcntl, errno, json, logging
from pprint import pformat
import websockets, traceback
from multiprocessing import Event
from valkka.multiprocess import MessageProcess, AsyncBackMessageProcess,\
    MessageObject, safe_select, EventGroup, SyncIndex
from valkka.api2 import FragMP4ShmemClient, ShmemClient
from valkka.streamer.singleton import event_fd_group_1

from task_thread import TaskThread, reCreate, reSchedule,\
    delete, verbose, signals # https://elsampsa.github.io/task_thread/_build/html/index.html


async def taskify(cofunc, *args, **kwargs):
    """Cofunc into a task (taken from the task_thread library)
    """
    task = asyncio.get_event_loop().create_task(cofunc(*args, **kwargs))
    return task


class MultiServerProcess(AsyncBackMessageProcess):
    """Normal frontend, asynchronous backend

    Two types of processes can be registered:

    - Listens to intercom shmem channels for results
    - Listens to fragmp4 shmem channels for stream
    """
    def __init__(self, mstimeout = 1000):
        super().__init__()
        self.mstimeout = mstimeout
        # self.logger = logging.getLogger("multiserver")
        self.rgb_register_lock = asyncio.Lock()
        """Multiprocessing clients are indexed by file descriptor (fd)
        indices:
        """
        self.intercom_client_by_fd = {} 
        self.fmp4_client_by_fd = {}

        """Asyncio queues where stuff is being fed are also indexed
        by file dtor (fd) indices:
        """
        self.intercom_queue_by_fd = {}
        self.fmp4_queue_by_fd = {}        

        """Cache frag-mp4 metadata packets
        """
        self.fmp4_meta_by_fd = {} # list of ftyp & moov

        """Websockets are requested as per stream slot, so we
        beed these mappings:
        """
        self.fmp4_fd_by_camname = {}
        self.intercom_fd_by_uuid = {}

        """Tasks that read from shmem servers and place packets into asyncio queues
        these are evoked upon websocket requests
        """
        self.fmp4_task_by_fd = {} # corresponds to self.pushTask__ tasks
        self.intercom_task_by_fd = {} # corresponds to self.intercom__ tasks

        self.ws_server = None
        self.slot_and_ipc_index_by_name = {} # only for frontend use

        """Sync primitives for front/backend intercom sync
        """
        self.event_group = EventGroup(20, Event) # create 10 multiprocessing.Event instances
        
        
    def preRun__(self):
        pass

        
    def postRun__(self):
        pass


    @verbose
    async def clearIntercomClientByFd__(self, fd):
        try:
            task = self.intercom_task_by_fd.pop(fd)
        except KeyError:
            pass
        else:
            await delete(task)
        loop = asyncio.get_event_loop()
        loop.remove_reader(fd)
        self.intercom_client_by_fd.pop(fd)
        self.intercom_queue_by_fd.pop(fd)
        uuid = None
        for uuid, fd_value in self.intercom_fd_by_uuid.items():
            if fd_value == fd:
                break
        if uuid is not None:
            self.intercom_fd_by_uuid.pop(uuid)

    @verbose
    async def clearFMP4ClientByFd__(self, fd):
        try:
            task = self.fmp4_task_by_fd.pop(fd)
        except KeyError:
            pass
        else:
            await delete(task)
        loop = asyncio.get_event_loop()
        loop.remove_reader(fd)
        self.fmp4_client_by_fd.pop(fd)
        self.fmp4_queue_by_fd.pop(fd)
        self.fmp4_meta_by_fd.pop(fd)
        camname = None
        for camname, fd_value in self.fmp4_fd_by_camname.items():
            if fd_value == fd:
                break
        if camname is not None:
            self.fmp4_fd_by_camname.pop(camname)

    async def asyncPre__(self):
        # print("asyncPre__")
        self.intercom_lock = asyncio.Lock()
        self.stream_lock = asyncio.Lock()


    async def asyncPost__(self):
        """cancel any remaining background tasks
        """
        self.logger.debug("stopping ws_servers")
        """"# not a task
        if self.ws_server_task is not None:
            if not self.ws_server_task.done():
                self.ws_server_task.cancel()
        """
        if self.ws_server is not None:
            self.ws_server.close()
            
        for fd in list(self.intercom_client_by_fd.keys()):
            await self.clearIntercomClientByFd__(fd)

        for fd in list(self.fmp4_client_by_fd.keys()):
            await self.clearFMP4ClientByFd__(fd)
    

    ## ** all calls that have their origin in websocket request **

    @verbose
    async def clientRequest__(self, *args):
        """This happens when a new websocket is requested

        Only one websocket connection per stream is allowed.  If there is a new incoming
        connection to the same slot, then the connection is "stealed"

        The ws server drops connection when you exit this cofunction
        """
        if len(args) == 1:
            self.logger.debug("clientRequest__: using websockets version 11.0+")
            ws_server_proto = args[0] # https://websockets.readthedocs.io/en/stable/reference/asyncio/server.html#websockets.server.WebSocketServerProtocol
            websocket = ws_server_proto
            path = ws_server_proto.path
        else:
            websocket = args[0]
            path = args[1]

        self.logger.debug("clientRequest__: path=%s", path)

        try:
            """This is called at a new websocket connection

            ::

                /ws/stream/camname = request stream for camera name camname
                /ws/message/uuid = request message channel for roi with uuid

            """
            self.logger.info("clientRequest__: websocket requested :")
            self.logger.info("clientRequest__: websocket path      :%s", path)

            parts = path.split("/")
            self.logger.debug("clientRequest__: parts %s", parts) 
            # ['', 'ws', 'stream', '1']
            if len(parts) != 4:
                self.logger.warning("clientRequest__: invalid path: must have length of 4")
                return
 
            tail = parts[-1]

            if parts[2] == "message":
                uuid = tail
                try:
                    fd = self.intercom_fd_by_uuid[uuid]
                except KeyError:
                    self.logger.critical("clientRequest__ : uuid %s not active", uuid)
                    return
                try:
                    task = self.intercom_task_by_fd.pop(fd)
                except KeyError:
                    pass
                else:
                    self.logger.warning("clientRequest__ : dropping old ws connection for uuid %s", uuid)
                    await delete(task)
                task = await taskify(self.intercom__, uuid, fd, websocket)
                self.intercom_task_by_fd[fd] = task
                # .. task is now in "the ether" running independently.  Exit this routine once the task is cancelled (that closes the ws connection)
                await asyncio.wait_for(task, None)

            elif parts[2] == "stream":
                # slot = int(tail)
                camname = tail
                try:
                    fd = self.fmp4_fd_by_camname[camname]
                except KeyError:
                    self.logger.critical("clientRequest__ : camera name '%s' not active or found", camname)
                    return
                try:
                    task = self.fmp4_task_by_fd.pop(fd)
                except KeyError:
                    pass
                else:
                    self.logger.warning("clientRequest__ : dropping old ws connection for camname %s", camname)
                    await delete(task)
                task = await taskify(self.pushTask__, camname, fd, websocket)
                self.fmp4_task_by_fd[fd] = task
                # .. task is now in "the ether" running independently.  Exit this routine once the task is cancelled (that closes the ws connection)
                await asyncio.wait_for(task, None)

        except Exception as e:
            self.logger.critical("clientRequest__ failed with: %s", e)
            self.logger.critical(traceback.format_exc())
            raise(BaseException)


    async def intercom__(self, uuid, fd, websocket):
        """read messages from the intercom queue & forward them to the correct websocket
        """
        queue = self.intercom_queue_by_fd[fd]

        # purge queue from old messages
        while not queue.empty():
            queue.get_nowait()

        ok = True
        try:
            while ok:
                try:
                    # print("intercom__ : waiting message for uuid", uuid)
                    json_str = await queue.get()
                    # print("intercom__ : got message for uuid", uuid)
                except Exception as e:
                    self.logger.warning("intercom__ : getting packets failed with %s", e)
                    ok = False

                try:
                    json_bytes = json.dumps(json_str)
                    await websocket.send(json_bytes)
                    # self.logger.debug("intercom__ : sent message %s", json_str) # this may contain an image as a string!
                    self.logger.debug("intercom__ : sent message")
                except Exception as e:
                    self.logger.warning("intercom__ : send failed with %s", e)
                    ok = False
        except asyncio.CancelledError:
            self.logger.info("intercom__ : cancelling for %s", uuid)

        try:
            await websocket.close()
        except Exception as e:
            self.logger.warning("intercom__ : could not close websocket for %s, reason: %s", uuid, e)

        self.logger.info("intercom__ : exit")


    @verbose
    async def pushTask__(self, camname, fd, websocket):
        """Starts a loop that reads fmp4 packets from a queue and
        pushes them through the websocket
        """
        self.logger.info("pushTask_: starting FMP4 from camname=%s, fd=%s", camname, fd)
        # dumptest = True
        dumptest = False
        # tell main process to activate the fmp4 shmem channel
        await self.send_out__(MessageObject(
            "fmp4-start",
            camname = camname
            ))

        try:
            key = False
            ftyp = None
            moov = None
            init_ = False
            ok = True

            self.logger.info("pushTask_: receiving FMP4 from camname=%s, fd=%s", camname, fd)
            if dumptest:
                f = open("dump.mp4", "wb", buffering = 0)
            while ok:
                try:
                    meta, packet = await self.fmp4_queue_by_fd[fd].get()
                    if dumptest:
                        self.logger.info("<%s> first=%s, len=%s, bytes=%s", 
                            meta.name, meta.is_first, meta.size, packet[0:5])
                    """
                    if meta.name == "moof":
                        print(">THIS IS MOOF")
                    else:
                        print(">NOT MOOF", len(meta.name), meta.name)
                    """

                except Exception as e:
                    print("getting packets failed with", e)
                    ok = False

                if meta.name == "ftyp":
                    init_ = False
                    moov = None
                    key = False
                    self.logger.info("pushTask_: got ftyp for camname=%s, fd=%s", 
                        camname, fd)
                    if ftyp is None:
                        ftyp = packet
                    else:
                        continue

                if meta.name == "moov":
                    key = False
                    self.logger.info("pushTask_: got moov for camname=%s, fd=%s", 
                        camname, fd)
                    if moov is None:
                        moov = packet
                    else:
                        continue

                if meta.name == "moof":
                    # print("moof.is_first", meta.is_first)
                    if ( (not key) and (ftyp is not None) and (moov is not None) and meta.is_first ):
                        # == keyframe not yet received, but ftyp & moov cached & just got moof keyframe
                        key = True
                        self.logger.info("pushTask_: got moof keyframe for camname=%s, fd=%s", 
                            camname, fd)

                if not key:
                    # no keyframe received yet
                    # print("got", meta.name)
                    continue
                else:
                    # print("keyframe received", meta.name)
                    pass

                try:
                    if not init_:
                        self.logger.info("pushTask__ : sending ftyp and moov")
                        await websocket.send(ftyp.tobytes())
                        await websocket.send(moov.tobytes())
                        if dumptest:
                            f.write(ftyp.tobytes())
                            f.write(moov.tobytes())
                            # f.flush()
                        init_ = True
                    await websocket.send(packet.tobytes())
                    if dumptest:
                        f.write(packet.tobytes())
                        # f.flush()
                    # print("sent packet", meta.name, packet[0:10], "of length", packet.shape)
                except Exception as e:
                    self.logger.warning("pushTask__ : websocket send failed with %s", e)
                    ok = False

        except asyncio.CancelledError:
            self.logger.warning("pushTask__ : cancelling for fd %s", fd)

        except Exception as e:
            self.logger.warning("pushTask__ : failed with %s", e)

        try:
            self.logger.warning("pushTask__ : closing websocket")
            await websocket.close()
            if dumptest:
                f.close()
        except Exception as e:
            self.logger.warning("pushTask__ : could not close websocket for %s, reason: %s", camname, e)

        # tell main process to deactivate the fmp4 shmem channel
        await self.send_out__(MessageObject(
            "fmp4-stop",
            camname = camname
            ))

        self.logger.info("pushTask__ : exit")


    # *** calls initiated by the main python process ***

    ## callbacks that are registered into the asyncio event loop
    ## for reading fmp4 and rgb24 analysis results
    
    def fragCallback(self, fd):
        """A callback that is launched always when a new
        mp4 fragment has been received through shared memory.

        Callback is launched when a eventfd is triggered.  Please
        see c__registerFMP4Pars for more info.
        
        NOTE: this must be a non-blocking method

        Each mp4 fragment is placed into an asyncio queue.
        """
        # self.logger.debug("fragCallback: fd=%s", fd)
        dump_packets = False # enable for per-packet extreme verbosity
        queue = self.fmp4_queue_by_fd[fd]
        client = self.fmp4_client_by_fd[fd]
        # self.logger.debug("fragCallback: fd=%s waiting for client", fd)
        index, meta = client.pullFrame()
        if dump_packets: print("fragCallback: fd=%s got packet" % (str(fd)))
        if (index == None):
            if dump_packets: print("fragCallback: frag-mp4 client timeout fd=%s" % (str(fd)))
        else:
            data = client.shmem_list[index][0:meta.size]
            # self.logger.debug("fragCallback: data len=%s, data type=%s", data.size, meta.name)
            if meta.name in ["moov", "ftyp"]:
                self.logger.debug("fragCallback: fd=%s, moov/ftyp data len=%s, data type=%s", fd, data.size, meta.name)
            """ # no caching of moov & ftyp here
                # self.logger.debug("fragCallback: 1")
                metadata = self.fmp4_meta_by_fd[fd]
                # self.logger.debug("fragCallback: 2")
                if len(metadata) >= 2:
                    pass
                else:
                    # self.logger.debug("fragCallback: 3")
                    self.fmp4_meta_by_fd[fd].append(data)
                self.logger.debug("fragCallback: number of metadata packets now=%s", len(self.fmp4_meta_by_fd[fd]))
            else:
            """
            if queue.full(): # make space in the queue
                # self.logger.warning("fmp4 queue overflow")
                queue.get_nowait()
            queue.put_nowait((
                copy.copy(meta), data.copy() # (metadata, payload)
                ))
        # self.logger.debug("fragCallback: exit fd=%s", fd)


    def rgbCallback(self, fd):
        """This handles messages coming from an rgb process
        """
        client = self.intercom_client_by_fd[fd]
        obj = client.pullObject()
        queue = self.intercom_queue_by_fd[fd]
        if (obj == None):
            self.logger.warning("MultiServer: warning: no rgb data")
        else:
            if queue.full(): # make space in the queue
                # self.logger.debug("MultiServer: queue pop")
                queue.get_nowait()
            queue.put_nowait(obj)


    # ** backend part of process calls **

    async def c__startWServer(self, port = 3001):
        try:
            self.logger.info("c__startWServer: starting at port %s", port)
            # self.ws_server = await websockets.serve(self.clientRequest__, host = "localhost", port = port) # docker doesn't like localhost
            self.ws_server = await websockets.serve(self.clientRequest__, host = "0.0.0.0", port = port)
            # .. that is not a coroutine nor task, but just a method that encapsulates the related coroutines and tasks
            # print("coro", coro)
        except Exception as e:
            self.logger.critical("c__startWServer failed with %s", e)
        else:
            self.logger.info("c__startWServer: started at port %s", port)


    @verbose
    async def c__registerFMP4Pars(self, 
        camname = None,
        name = None,
        n_ringbuffer = None,
        n_size = None,
        ipc_index = None,
        slot = None,
        sync_event_index = None
        ):
        """Create a queue for fmp4 fragments & for rgb process messages

        :param ipc_index: index of the global eventfd synchronization primitive
        """
        self.logger.info("c__registerFMP4Pars: name=%s, slot=%s", name, slot)
        client = FragMP4ShmemClient(
            name = name,
            n_ringbuffer = n_ringbuffer,
            n_size = n_size,
            mstimeout = self.mstimeout
        )
        self.logger.debug("c__registerFMP4Pars: slot=%s creating fmp4 client", slot)
        # _, eventfd = event_fd_group_1.reserve() # NOPES!
        eventfd = event_fd_group_1.fromIndex(ipc_index)
        client.useEventFd(eventfd)
        fd = eventfd.getFd()
        self.logger.debug("c__registerFMP4Pars: slot=%s using eventd %s", slot, fd)

        self.fmp4_client_by_fd[fd] = client
        self.fmp4_queue_by_fd[fd] = asyncio.Queue(100)
        self.fmp4_meta_by_fd[fd] = []
        self.fmp4_fd_by_camname[camname] = fd
        
        # schedule a re-scheduling task that pushes fmp4 to the websocket
        loop = asyncio.get_event_loop()
        # always when file descriptor fd triggers, self.fragCallback is called:
        # it reads the client and pushes stuff from the client into async queue
        loop.add_reader(fd, self.fragCallback, fd)

        self.event_group.fromIndex(sync_event_index).set()


    @verbose
    async def c__deregisterFMP4Pars(self, 
        ipc_index = None,
        sync_event_index = None
        ):
        fd = fdFromIndex(ipc_index)
        # TODO: close any active websockets
        # tell main process to deactivate mp4 channel
        await self.clearFMP4ClientByFd__(fd)
        """
        key = None
        for slot, fd_value in self.fmp4_slot_to_fd.items():
            if fd_value == fd:
                break
        if slot is not None:
            self.fmp4_slot_to_fd.pop(slot)
            self.intercom_queue_by_slot.pop(slot)
        """
        self.logger.info("c__registerFMP4Pars fd=%s: OK", fd)
        self.event_group.fromIndex(sync_event_index).set()


    @verbose
    async def c__registerRGBProcess(self,
        name = None,
        uuid = None,
        n_ringbuffer = None,
        n_bytes = None,
        ipc_index = None,
        # slot = None, # not needed & confusing
        sync_event_index = None
        ):
        async with self.rgb_register_lock:
            eventfd = event_fd_group_1.fromIndex(ipc_index)
            fd = eventfd.getFd() # this is a plain file-descriptor number that can be used with select
            # fd is file descriptor for the intercom from rgb process
            self.logger.debug("c__registerRGBProcess: name=%s intercom fd=%s",\
                name, fd)
            client = ShmemClient(
                name = name,
                n_ringbuffer = n_ringbuffer,
                n_bytes = n_bytes,
                mstimeout = self.mstimeout
            )
            client.useEventFd(eventfd)
            self.intercom_client_by_fd[fd] = client
            self.intercom_queue_by_fd[fd] = asyncio.Queue(100)
            
            self.intercom_fd_by_uuid[uuid] = fd
            self.logger.debug("c__registerRGBProcess: intecom_fd_by_uuid now %s", pformat(self.intercom_fd_by_uuid))

            loop = asyncio.get_event_loop()
            loop.add_reader(fd, self.rgbCallback, fd)
            self.logger.info("c__registerRGBProcess: intercom fd=%s OK", fd)

        self.event_group.fromIndex(sync_event_index).set()


    async def c__deregisterRGBProcess(self,
        ipc_index = None,
        sync_event_index = None
        ):
        async with self.rgb_register_lock:
            fd = fdFromIndex(ipc_index)
            self.logger.info("c__deregisterRGBProcess: intercom fd=%s", fd)
            await self.clearIntercomClientByFd__(fd)
        self.event_group.fromIndex(sync_event_index).set()



    # *** frontend ***

    def startWServer(self, port = 3001):
        self.sendMessageToBack(MessageObject(
            "startWServer",
            port = port
        ))


    # the following calls add and remove shmem clients
    # in the backend, so their completion must be waited 
    # in the frontend
    
    def registerFMP4Pars(self,
        camname = None,
        name = None,
        n_ringbuffer = None,
        n_size = None,
        ipc_index = None,
        slot = None
        ):
        self.logger.info("registerFMP4Pars name=%s ", name)
        self.slot_and_ipc_index_by_name[name] = (slot, ipc_index)
        
        with SyncIndex(self.event_group) as i:
            self.logger.info("registerFMP4Pars name=%s sending message to multiprocessing backend", name)
            self.sendMessageToBack(MessageObject(
                "registerFMP4Pars", camname = camname,
                name = name, n_ringbuffer = n_ringbuffer, n_size = n_size,
                ipc_index = ipc_index, slot = slot,
                sync_event_index = i
            ))
            # backend will set the event once the call is ready
            self.logger.info("registerFMP4Pars name=%s waiting multiprocessing backend", name)
        
        self.logger.info("registerFMP4Pars name=%s OK", name)


    def deregisterFMP4Pars(self, name = None):
        slot, ipc_index = self.slot_and_ipc_index_by_name.pop(name)

        self.logger.info("registerFMP4Pars name=%s ", name)

        with SyncIndex(self.event_group) as i:
            self.logger.info("registerFMP4Pars name=%s send message to backend", name)
            self.sendMessageToBack(MessageObject(
                "deregisterFMP4Pars",
                ipc_index = ipc_index,
                sync_event_index = i
            ))
            self.logger.info("registerFMP4Pars name=%s waiting backend", name)
        self.logger.info("deregisterFMP4Pars name=%s OK", name)


    def registerRGBProcess(self, rgb_process):
        pars = rgb_process.getDataShmemPars()

        with SyncIndex(self.event_group) as i:
            self.sendMessageToBack(MessageObject(
                "registerRGBProcess",
                name = pars["name"], # not slot, but this is what matters
                n_ringbuffer = pars["n_ringbuffer"],
                n_bytes = pars["n_bytes"],
                ipc_index = pars["ipc_index"],
                # slot = pars["slot"], # not needed & confusing
                sync_event_index = i,
                uuid = rgb_process.getUUID()
            ))
        self.logger.info("registerRGBProcess OK")


    def deregisterRGBProcess(self, rgb_process):
        with SyncIndex(self.event_group) as i:
            pars = rgb_process.getDataShmemPars()
            self.sendMessageToBack(MessageObject(
                "deregisterRGBProcess",
                ipc_index = pars["ipc_index"],
                sync_event_index = i
            ))
        self.logger.info("deregisterRGBProcess OK")

    

def test1():
    p = MultiServerProcess()
    p.start()
    time.sleep(1)
    print("start ws server")
    p.startWServer()
    time.sleep(1)

    _, eventfd = event_fd_group_1.reserve()
    ipc_index = event_fd_group_1.asIndex(eventfd)

    print("register pars")
    p.registerFMP4Pars(
        name = "kokkelis",
        n_ringbuffer = 10,
        n_size = 1024,
        ipc_index = ipc_index)
    time.sleep(1)

    print("deregister pars")
    p.deregisterFMP4Pars(
        name = "kokkelis")
    time.sleep(1)

    from streamer.mp.rgb2 import RGBProcess
    rgb_process = RGBProcess()
    rgb_process.start()

    print("register rgb")
    
    p.registerRGBProcess(rgb_process)
    time.sleep(1)

    print("deregister rgb")
    p.registerRGBProcess(rgb_process)
    time.sleep(1)

    event_fd_group_1.release(eventfd)

    print("exiting")
    p.stop()
    rgb_process.stop()
    print("bye!")

if __name__ == "__main__":
    test1()
 