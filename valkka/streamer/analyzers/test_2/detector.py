import numpy as np
import time

class Detector:
    """A simple stupid movement detector

    After seeing movement method __call__ returns True during timewait seconds
    """

    def __init__(self, tolerance=0.1, timewait=10):
        self.tolerance=tolerance
        self.timewait=timewait
        self.prev = None
        self.t0 = 0

    def __call__(self, img: np.array) -> bool:
        if self.prev is None:
            self.prev = img
            return False
        d = img - self.prev
        self.prev = img
        # print(">>", d.sum()/np.prod(d.shape)/255.)
        if (d.sum()/np.prod(d.shape)/255. >= self.tolerance):
            self.t0=time.time()
        return time.time()-self.t0 < self.timewait

    def setTolerance(self, t):
        self.tolerance = t


def test():
    det = Detector()
    # TODO: test here your detector in any way imaginable

if __name__ == "__main__":
    test()
