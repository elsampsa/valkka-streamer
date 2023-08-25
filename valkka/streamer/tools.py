"""
tools.py : tool functions

* Copyright : 2017 Sampsa Riikonen
* Authors   : Sampsa Riikonen
* Date      : 2017
* Version   : 0.1

This file is part of the python skeleton example library

Skeleton example library is free software: you can redistribute it and/or modify it under the terms of the MIT License.  
This code is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
See the MIT License for more details.
"""

import copy
import types
import sys
import os
import inspect
import logging
import logging.config
import yaml
import argparse, configparser
from pathlib import Path

from . import local
from . import constant

is_py3 = (sys.version_info >= (3,0))


def configureLogging(reset = False):
    """Define logging & loglevels using an external yaml config file
    """
    # this was useful: https://gist.github.com/glenfant/4358668
    from .local import AppLocalDir

    log_config_dir = AppLocalDir("logging")
    # now we have directory "~/.skeleton/logging"

    if not log_config_dir.has("default.yml") or reset:
        print("WARNING: initializing logger configuration")
        with open(log_config_dir.getFile("default.yml"),"w") as f:
            f.write(constant.LOGGING_CONF_YAML_DEFAULT)
        # now we have "~/.skeleton/logging/default.yml"

    # read "~/.skeleton/logging/default.yml"
    f = open(log_config_dir.getFile("default.yml"),"r")
    logging_str = f.read()
    f.close()
    
    try:
        logging_config = yaml.load(logging_str, Loader=yaml.FullLoader)
        logging.config.dictConfig(logging_config['logging'])
    except Exception as e:
        print("FATAL : your logging configuration is broken")
        print("FATAL : failed with '%s'" % (str(e)))
        print("FATAL : remove it and start the program again")
        raise SystemExit(2)


def confLogger(logger, level):
    logger.setLevel(level)
    logger.propagate = False
    # if not logger.hasHandlers(): # when did this turn into a practical joke?
    logger.handlers = []
    formatter = logging.Formatter("%(name)s - %(levelname)s - %(message)s")
    ch = logging.StreamHandler()
    ch.setFormatter(formatter)
    logger.addHandler(ch)


def quickLog(name, level):
    logger = logging.getLogger(name)
    confLogger(logger, level)
    return logger


def getModulePath():
  lis=inspect.getabsfile(inspect.currentframe()).split("/")
  st="/"
  for l in lis[:-1]:
    st=os.path.join(st,l)
  return st
  

def getTestDataPath():
  return os.path.join(getModulePath(),"test_data")


def getTestDataFile(fname):
  return os.path.join(getTestDataPath(),fname)


def getDataPath():
  return os.path.join(getModulePath(),"data")


def getDataFile(fname):
  """Return complete path to datafile fname.  Data files are in the directory skeleton/skeleton/data
  """
  return os.path.join(getDataPath(),fname)


class IniCLI:
    """A configparser wrapper that does the following:

    In ctor, adds an .ini file as an argument

    After that, you can use the method ``add_argument`` to add more arguments in the
    normal way

    __call__ returns (parsed_arguments, cfg), where cfg is the data from configparser

    Loggers are configured from the ini file
    """
    def __init__(self, default_ini, descr=''):
        comname = Path(sys.argv[0]).stem
        self.parser = argparse.ArgumentParser(
            usage=(
                f'{comname} [options]\n'
            ),
            formatter_class=argparse.ArgumentDefaultsHelpFormatter
            # ..shows default values with -h arg
        )
        self.parser.add_argument("--ini", action="store", type=str, required=False,
            help=".ini configuration file", default=default_ini)

    def add_argument(self, *args, **kwargs):
        self.parser.add_argument(*args, **kwargs)

    def getParser(self):
        return self.parser

    def __call__(self):
        parsed, unparsed = self.parser.parse_known_args()
        parsed.ini = os.path.abspath(parsed.ini)
        assert(os.path.exists(parsed.ini)), (
            f"can't find .ini file '{parsed.ini}' sure you defined absolute path?\n"
            "you can also define the path with the --ini flag\n"
        )
        print("using ini file", parsed.ini)
        for arg in unparsed:
            print("Unknow option", arg)
            sys.exit(2)
        cfg = configparser.ConfigParser()
        cfg.read(parsed.ini)
        try:
            logging.config.fileConfig(cfg, disable_existing_loggers=True)
        except Exception as e:
            print("there was error reading your .ini file.  Please check your logger definitions")
            print("failed with:", e)
            raise(e)
        return parsed, cfg


class YamlCLI:
    """A configparser wrapper that does the following:

    In ctor, adds a .yaml file as an argument

    After that, you can use the method ``add_argument`` to add more arguments in the
    normal way

    __call__ returns (parsed_arguments, cfg), where cfg is the data from configparser
    
    Loggers are configured from the yaml file
    """
    def __init__(self, default_yaml, descr=''):
        comname = Path(sys.argv[0]).stem
        self.parser = argparse.ArgumentParser(
            usage=(
                f'{comname} [options]\n'
            ),
            formatter_class=argparse.ArgumentDefaultsHelpFormatter
            # ..shows default values with -h arg
        )
        self.parser.add_argument("--yaml", action="store", type=str, required=False,
            help=".yaml configuration file", default=default_yaml)

    def add_argument(self, *args, **kwargs):
        self.parser.add_argument(*args, **kwargs)

    def getParser(self):
        return self.parser

    def __call__(self):
        parsed, unparsed = self.parser.parse_known_args()
        parsed.ini = os.path.abspath(parsed.yaml)
        assert(os.path.exists(parsed.yaml)), (
            f"can't find .ini file '{parsed.ini}' sure you defined absolute path?\n"
            "you can also define the path with the --yaml flag\n"
        )
        print("using yaml file", parsed.yaml)
        for arg in unparsed:
            print("Unknow option", arg)
            sys.exit(2)
        with open(parsed.yaml,'r') as f:
            # cfg=yaml.safe_load(f)
            # cfg=yaml.load(f)
            cfg=yaml.load(f, Loader=yaml.FullLoader)
        """Config loggers with the yaml file if section "logging"
        is avail:
        """
        if "logging" in cfg:
            logging.config.dictConfig(cfg['logging'])
        return parsed, cfg
