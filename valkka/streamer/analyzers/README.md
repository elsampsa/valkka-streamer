# Analyzer modules

Each custom analyzer lives in its own directory

```
test_1          : a simple opencv-based movement detector
test_2          : like test_1, but also uses yolo (master_test_1) upon seeing a new movement event
master_test_1   : a yolo analyzer doing object detection - used by client analyzers
```

You will be adding your own analyzers in subdirectories.  Subdirectory names correspond to the analyzer names in the configuration
[yaml file](../data/example.yaml).

Each subdirectory should have file named ``main.py``, that starts exactly like this:
```
from valkka.streamer.multiprocess.client import ClientProcess

class AnalyzerProcess(ClientProcess):

...
...

```
i.e. there should always be a class ``AnalyzerProcess``.


For master processes, ``main.py`` should start like this:
```
from valkka.streamer.multiprocess.master import MasterProcess as MasterProcess_

class MasterProcess(MasterProcess_):

...
...

```
i.e. there should always be a class ``MasterProcess``.


**WARNING**: your main.py **should never import tensorflow, pytorch, etc.** "heavy" libraries that use multithreading.  The import statements
should be done in the method ``preRun__`` instead.  Or preferably in a separate .py file that is then imported at ``preRun__`` (for more details, see
the provided example main.py files in test_1/, test_2/ and  master_test_1/).

This has to do with the quirks of combining multithreading and processing and is documented elsewhere.  You can take a look in [here](https://elsampsa.github.io/valkka-multiprocess/_build/html/index.html).


