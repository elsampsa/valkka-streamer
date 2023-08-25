"""
constant.py : Some constants for your module

* Copyright: 2020 Sampsa Riikonen
* Authors  : Sampsa Riikonen
* Date     : 2020
* Version  : 0.1

This file is part of the skeleton library

Skeleton example library is free software: you can redistribute it and/or modify it under the terms of the MIT License.  
This code is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  
See the MIT License for more details.
"""

LOGGING_CONF_YAML_DEFAULT = """\
%YAML 1.2
---
logging:

    version: 1
    disable_existing_loggers: true
    root:
        level: !!python/name:logging.INFO
        handlers: [console]
    
    loggers:
        # *** Configure here your loggers ***
        
        this.is.namespace: # namespace you have defined for you logger
            level: !!python/name:logging.DEBUG
            handlers: [console]
            qualname: this.is.namespace
            propagate: false

        BaseHelloWorld:
            level: !!python/name:logging.DEBUG
            handlers: [console]
            qualname: BaseHelloWorld
            propagate: false

        FancyHelloWorld:
            level: !!python/name:logging.DEBUG
            handlers: [console]
            qualname: FancyHelloWorld
            propagate: false
        
    handlers:
      
        console:
            class: logging.StreamHandler
            stream: ext://sys.stdout
            formatter: simpleFormatter
            level: !!python/name:logging.NOTSET
      
    formatters:
        simpleFormatter:
            format: '%(name)s - %(levelname)s - %(message)s'
            datefmt: '%d/%m/%Y %H:%M:%S'
"""

SOME = """\
%YAML 1.2
---
data:

    version:1
    some: random yaml data
"""

#from .parset import MyParameterSet
# parameter set with the default values as defined in yaml_model
#my_parameter_set = MyParameterSet()
