# La pile pas à pas d'un programme Python, pour l'IDE des cours (ide.js) : chaque ligne exécutée du fichier donne un pas
# (la ligne, la pile d'appels avec les variables de chaque appel, ce que le programme a affiché jusque-là).
# python ide-trace.py main.py entree.txt  ->  un JSON sur la sortie : {"steps": [...], "error": "..."|null}
import io, json, sys

MAX_STEPS = 600
target, entree = sys.argv[1], sys.argv[2]
with open(target, encoding="utf-8") as f:
    src = f.read()
with open(entree, encoding="utf-8") as f:
    stdin_text = f.read()

real_out = sys.stdout
out = io.StringIO()
steps = []


class Stop(Exception):
    pass


def short(v):
    try:
        t = repr(v)
    except Exception as e:  # un __repr__ qui plante ne casse pas la trace
        t = f"<{type(v).__name__} : {e}>"
    t = " ".join(t.split())
    return t if len(t) <= 160 else t[:157] + "…"


def frames(frame):
    st = []
    while frame is not None:
        if frame.f_code.co_filename == target:
            name = frame.f_code.co_name
            loc = {k: short(v) for k, v in frame.f_locals.items()
                   if not (k.startswith("__") and k.endswith("__")) and not callable(v) and type(v).__name__ != "module"}
            st.append({"func": "programme" if name == "<module>" else name, "line": frame.f_lineno, "vars": loc})
        frame = frame.f_back
    return st


def tracer(frame, event, arg):
    if frame.f_code.co_filename != target:
        return None
    if event in ("line", "return", "exception"):
        if len(steps) >= MAX_STEPS:
            raise Stop()
        step = {"line": frame.f_lineno, "event": event, "stack": frames(frame), "out": out.getvalue()}
        if event == "return":
            step["ret"] = short(arg)
        if event == "exception":
            step["exc"] = f"{arg[0].__name__}: {arg[1]}"
        steps.append(step)
    return tracer


error = None
sys.stdout, sys.stdin = out, io.StringIO(stdin_text)
code = compile(src, target, "exec")
sys.settrace(tracer)
try:
    exec(code, {"__name__": "__main__", "__file__": target})
except Stop:
    error = f"Arrêté après {MAX_STEPS} pas (boucle trop longue ?)."
except BaseException as e:  # l'exception du programme : montrée, pas plantée
    error = f"{type(e).__name__}: {e}"
finally:
    sys.settrace(None)
    sys.stdout = real_out
steps.append({"line": steps[-1]["line"] if steps else 1, "event": "end", "stack": [], "out": out.getvalue()})
json.dump({"steps": steps, "error": error}, real_out, ensure_ascii=False)
