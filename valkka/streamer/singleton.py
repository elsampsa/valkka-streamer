"""This is a global singleton module that must be imported in the very beginning 
by any other module that wishes to do multiprocess intercommunication.

This way the interprocess-communication (ipc) file descriptors are visible 
to all multiprocesses.

File descriptors allow you to multiplex several frame sources at a single process.  
For multiplexing file descriptors, see this: https://docs.python.org/3/howto/sockets.html
"""

from valkka.multiprocess.sync import EventGroup
from valkka.core import EventFd

event_fd_group_1 = EventGroup(100, EventFd)
