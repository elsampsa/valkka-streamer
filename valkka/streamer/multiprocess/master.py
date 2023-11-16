import sys, os, uuid, time
from valkka.multiprocess import MessageProcess, MessageObject, safe_select
from valkka.api2 import ShmemRGBClient, ShmemRGBServer, ShmemClient, ShmemServer
# from skeleton.singleton import getEventFd, reserveEventFd, releaseEventFd, eventFdToIndex, reserveIndex, getFdFromIndex
from valkka.streamer.singleton import event_fd_group_1
from valkka.multiprocess.sync import EventGroup, SyncIndex
from valkka.streamer.multiprocess.client import ClientProcess

class MasterProcess(MessageProcess):
    """Receives RGB24 frames from a client process & responds with a message and some other data

    :param datasize: has a sharedmem data server for communicating results back to a client 
                     process.  Maximum size of serialized data in bytes.
    """
    def __init__(self, name = "master", max_clients=5, datasize=1024*1024*1):
        super().__init__(name=name)
        self.max_clients=max_clients
        self.registered_clients = []
        self.data_n_bytes = datasize
        self.data_n_buffer = 10
        self.eg = EventGroup(10)
        

    def preRun__(self):
        super().preRun__()
        self.client_by_fd = {}
        self.data_server_by_fd = {}
        self.data_server_by_client_fd = {}
        # here you would also create your heavy neural net detector instance


    def postRun__(self):
        super().postRun__()
        self.client_by_fd = {}
        self.data_server_by_fd = {}
        self.data_server_by_client_fd = {}


    def readPipes__(self, timeout):
        """Multiplex all intercom pipes / events

        This is used by your multiprocesses run() method
        (which you don't need to touch)

        Multiplexing file-descriptor is actually more neat in asyncio: 
        see the fragmp4 process

        For a tutorial for multiplexing communication pipes and sockets
        in normal (not asyncio) python, see: https://docs.python.org/3/howto/sockets.html
        """
        rlis = [self.back_pipe]
        # self.back_pipe is the intercom pipe with the main python process
        # listen to all rgb frame sources
        frame_fds = list(self.client_by_fd.keys())
        rlis += frame_fds
        rs, ws, es = safe_select(rlis, [], [], timeout = timeout)
        # rs is a list of event file descriptors that have been triggered
        for fd in rs:
            # 1. handle the main intercom pipe
            if fd == self.back_pipe:
                self.handleBackPipe__(self.back_pipe)
            # 2. handle frame coming from the client processes
            if fd in frame_fds:
                client = self.client_by_fd[fd]
                index, meta = client.pullFrame()
                # TODO at cpp side : if shmem server side feeds much larger frames
                # than defined for the client, that line gets stuck

                if (index == None):
                    self.logger.warning("rgb client got none")
                else:
                    data = client.shmem_list[index][0:meta.size]
                    data = data.reshape((meta.height, meta.width, 3))
                    self.handleFrame__(data, meta, fd)


    def handleFrame__(self, frame, meta, fd):
        self.logger.debug("handleFrame__ : got frame %s", frame.shape)
        server = self.data_server_by_client_fd[fd]
        # here you would use your heavy neural net detector instance
        # and create a message with, for example, the bounding box coordinates
        obj = {
            "this is" : "a message"
        }
        # send a message to the correct client:
        server.pushObject(obj)


    def c__registerClientProcess(self,
            name = None,
            n_ringbuffer = None,
            width = None,
            height = None,
            ipc_index = None, # master listening to client
            data_ipc_index = None # client listening to master
        ):
        self.logger.debug("c__registerClientProcess called with %s %s %s %s", name, n_ringbuffer, width, height)
        client = ShmemRGBClient(
            name = name,
            n_ringbuffer = n_ringbuffer,
            width = width,
            height = height,
            mstimeout = 1, # semaphore timeout
            verbose = False
        )
        # eventfd = getEventFd(ipc_index)
        eventfd = event_fd_group_1.fromIndex(ipc_index)
        client.useEventFd(eventfd) # do not forget!
        # let's get a posix file descriptor, i.e. a plain integer:
        fd = eventfd.getFd()
        self.logger.debug("c__registerClientProcess: will listen fd %s", fd)
        self.client_by_fd[fd] = client
        # establish a shmem channel for communicating the results back to the client process
        name = uuid.uuid1().hex
        data_pars = {
            "name"            :name,
            "n_ringbuffer"    :self.data_n_buffer,   # size of ring buffer
            "n_bytes"         :self.data_n_bytes,
        }
        # eventfd = getEventFd(data_ipc_index)
        eventfd = event_fd_group_1.fromIndex(data_ipc_index)
        server = ShmemServer(**data_pars)
        server.useEventFd(eventfd)
        data_fd = eventfd.getFd()
        self.logger.debug("c__registerClientProcess: will write messages to fd %s", fd)
        self.data_server_by_fd[data_fd] = server
        self.data_server_by_client_fd[fd] = server
        data_pars["ipc_index"] = data_ipc_index
        self.return_out__(data_pars) # return results to frontend


    def c__deregisterClientProcess(self,
            ipc_index = None,
            data_ipc_index = None,
            sync_index = None
        ):
        # fd = getFdFromIndex(ipc_index)
        fd = event_fd_group_1.fromIndex(ipc_index).getFd()
        try:
            self.client_by_fd.pop(fd)
            self.data_server_by_client_fd.pop(fd)
        except KeyError:
            self.logger.warning("c__deregisterClientProcess : no client at ipc_index %s", ipc_index)

        # fd = getFdFromIndex(data_ipc_index)
        fd = event_fd_group_1.fromIndex(data_ipc_index).getFd()
        try:
            self.data_server_by_fd.pop(fd)
        except KeyError:
            self.logger.warning("c__deregisterClientProcess : no intercom client at ipc_index %s", data_ipc_index)
        self.eg.set(sync_index) # tell frontend we're ready


    # *** frontend ***

    def registerClientProcess(self, client_process: ClientProcess):
        """
        - A client process has sharedmem channel for receiving RGB24 frames from libValkka c++ side
        - ..then the client process forwards that RGB24 frame (or a part of it) to this master process
        -  .. so the client process establishes it's own shared memory RGB24 server that is listened by the master process
        """
        if client_process in self.registered_clients:
            self.logger.warning("registerClientProcess: process already registered %s", client_process)
            return

        data_ipc_index, event_fd = event_fd_group_1.reserve() # client listening to master
        pars = client_process.getRGB24ServerPars()
        pars["data_ipc_index"] = data_ipc_index
        self.sendMessageToBack(MessageObject( # tell master process to start listening to the RGB24 shmem server
            "registerClientProcess",
            **pars # pars include the ipc_index that is the evenfd corresponding to ClientProcesses shmem server
        ))
        # as a reply, we receive the shmem server parameters we need to listen for result messages
        # tell client that it can start listening the shmem intercom channel
        data_pars = self.returnFromBack()
        self.logger.debug("registerClientProcess: backend returned with %s", data_pars)
        client_process.listenDataServer(**data_pars)
        self.registered_clients.append(client_process)


    def deregisterClientProcess(self, client_process: ClientProcess):
        """Sends client's Shmem Server parameters to this process & 
        """
        try:
            self.registered_clients.remove(client_process)
        except ValueError:
            self.logger.warning("deregisterClientProcess: no such client process registered %s", client_process)
            return

        ipc_index = client_process.getRGB24ServerPars()["ipc_index"]
        data_ipc_index = client_process.data_ipc_index

        with SyncIndex(self.eg) as sync_index: # wait until backend has finished
            self.sendMessageToBack(MessageObject(
                "deregisterClientProcess",
                ipc_index = ipc_index,
                data_ipc_index = data_ipc_index,
                sync_index = sync_index
            ))
        event_fd_group_1.release_ind(data_ipc_index)


    def full(self):
        return len(self.registered_clients) >= self.max_clients


def test1():
    print("starting")
    p = MasterProcess()
    p.start()
    time.sleep(1)
    print("stopping")
    p.stop()
    print("bye!")


def test2():
    from skeleton.multiprocess.client import ClientProcess

    print("starting")
    p = MasterProcess()
    p.start()
    time.sleep(1)
    print("creating client process")
    client = ClientProcess()
    client.start()
    print("registering client process")
    p.registerClientProcess(client)
    print("deregistering client process")
    p.deregisterClientProcess(client)
    print("stopping client")
    client.stop()
    print("stopping")
    p.stop()
    print("bye!")


if __name__ == "__main__":
    # test1()
    test2()
