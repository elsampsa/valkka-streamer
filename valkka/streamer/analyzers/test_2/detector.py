import numpy as np

class Detector:
    """A simple stupid movement detector
    """

    def __init__(self, tolerance=0.1):
        self.tolerance=tolerance
        self.prev = None

    def __call__(self, img: np.array) -> bool:
        if self.prev is None:
            self.prev = img
            return False
        d = img - self.prev
        self.prev = img
        # print(">>", d.sum()/np.prod(d.shape)/255.)
        return d.sum()/np.prod(d.shape)/255. >= self.tolerance

    def setTolerance(self, t):
        self.tolerance = t


def test():
    det = Detector()
    # TODO: test here your detector in any way imaginable

if __name__ == "__main__":
    test()
