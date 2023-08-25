import logging
from valkka.streamer.tools import YamlCLI, getDataFile
from valkka.streamer.main import Manager
from valkka.streamer.multiprocess import MultiServerProcess

def main():
    cli = YamlCLI(default_yaml=getDataFile("example.yaml"))
    args, cfg = cli()

    """TODO: args for invoking debug run, qt interface, etc.
    cfg from yaml file
    """
    # Manager.formatLogger(logging.DEBUG) # of course in a real app, in some other way
    # MultiServerProcess.formatLogger(logging.DEBUG)
    manager = Manager(args=args, cfg=cfg)
    manager()


if __name__ == "__main__":
    main()

