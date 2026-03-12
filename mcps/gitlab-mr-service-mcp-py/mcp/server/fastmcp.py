from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])


class FastMCP:
    def __init__(self, name: str) -> None:
        self.name = name

    def tool(self) -> Callable[[F], F]:
        def decorator(func: F) -> F:
            return func

        return decorator

    def run(self, transport: str) -> None:
        return
