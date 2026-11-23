class SimulationError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False, status: int = 409):
        super().__init__(message)
        self.code, self.retryable, self.status = code, retryable, status
