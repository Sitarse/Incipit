// Le pas à pas Java de l'IDE des cours (ide-java.js) : lance le programme sous JDI (l'API de débogage du JDK), s'arrête
// à chaque ligne des classes de l'exemple et écrit sur sa sortie, en JSON, la « photo de la mémoire » de chaque pas au
// format commun (ide-mem.js) : les cadres (main d'abord), leurs variables et this, les objets par uniqueID(), les
// tableaux, les collections de java.util par leur contenu, les String et nombres encapsulés en ligne, les static.
// java --add-modules jdk.jdi -cp <ce dossier> HitoTrace <dossier du programme> <classe main> <entree.txt> <max pas>
import com.sun.jdi.*;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.LaunchingConnector;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class HitoTrace {
  static final String[] EXCL = { "java.*", "javax.*", "jdk.*", "sun.*", "com.sun.*" };
  static final int NIVEAUX = 3, MAX_OBJETS = 30, CASES = 12;
  static final Set<String> BOXED = Set.of("java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte",
    "java.lang.Double", "java.lang.Float", "java.lang.Boolean", "java.lang.Character");
  static final Set<String> user = new HashSet<>();
  static final List<ReferenceType> userTypes = new ArrayList<>(); // les classes de l'exemple déjà chargées (pas allClasses() à chaque pas)
  static final ByteArrayOutputStream out = new ByteArrayOutputStream();
  static final List<String> steps = new ArrayList<>();
  static VirtualMachine vm;
  static ThreadReference thread;
  static Map<Long, String> heap;
  static String lastBody = null;
  // Appeler une méthode du programme (toArray, toString) pendant une sortie de méthode ou une exception fait tomber la
  // JVM : à ces pas-là, les collections et StringBuilder reprennent ce qui a été lu au pas d'avant
  static boolean noInvoke;
  static final Map<Long, String> known = new HashMap<>();

  public static void main(String[] a) throws Exception {
    String dir = a[0], mainClass = a[1], input = a[2];
    int max = Integer.parseInt(a[3]);
    Path root = Paths.get(dir);
    try (var w = Files.walk(root)) {
      w.filter(p -> p.toString().endsWith(".class")).forEach(p -> user.add(root.relativize(p).toString().replaceAll("\\.class$", "").replace(File.separatorChar, '.')));
    }
    LaunchingConnector lc = Bootstrap.virtualMachineManager().defaultConnector();
    Map<String, Connector.Argument> args = lc.defaultArguments();
    args.get("main").setValue(mainClass);
    args.get("options").setValue("-cp \"" + dir + "\" -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 -Dstderr.encoding=UTF-8");
    vm = lc.launch(args);
    Process p = vm.process();
    drain(p.getInputStream()); drain(p.getErrorStream());
    try (OutputStream os = p.getOutputStream()) { os.write(Files.readAllBytes(Paths.get(input))); } catch (IOException e) { }

    EventRequestManager erm = vm.eventRequestManager();
    ClassPrepareRequest cpr = erm.createClassPrepareRequest();
    for (String e : EXCL) cpr.addClassExclusionFilter(e);
    cpr.enable();
    erm.createExceptionRequest(null, false, true).enable();
    MethodExitRequest mx = erm.createMethodExitRequest();
    for (String e : EXCL) mx.addClassExclusionFilter(e);
    String error = null;
    boolean started = false;
    loop:
    while (true) {
      EventSet set = vm.eventQueue().remove();
      for (Event ev : set) {
        if (ev instanceof ClassPrepareEvent ce && user.contains(ce.referenceType().name())) userTypes.add(ce.referenceType());
        if (ev instanceof ClassPrepareEvent ce && ce.referenceType().name().equals(mainClass)) {
          for (Method m : ce.referenceType().methodsByName("main"))
            if (m.location() != null) erm.createBreakpointRequest(m.location()).enable();
        } else if (ev instanceof BreakpointEvent be && !started) {
          started = true;
          be.request().disable();
          thread = be.thread();
          StepRequest sr = erm.createStepRequest(thread, StepRequest.STEP_LINE, StepRequest.STEP_INTO);
          for (String e : EXCL) sr.addClassExclusionFilter(e);
          sr.enable();
          mx.enable();
          snapshot("line", null, null);
        } else if (ev instanceof StepEvent se && ours(se.location())) {
          snapshot("line", null, null);
        } else if (ev instanceof MethodExitEvent me && started && me.thread().equals(thread) && ours(me.location())) {
          Value r = me.returnValue();
          snapshot("return", r == null || r instanceof VoidValue ? null : text(r), null);
        } else if (ev instanceof ExceptionEvent xe) {
          thread = xe.thread();
          String exc = excText(xe.exception());
          error = exc;
          snapshot("exception", null, exc);
        } else if (ev instanceof VMDeathEvent || ev instanceof VMDisconnectEvent) break loop;
      }
      if (steps.size() >= max) { error = "Arrêté après " + max + " pas (boucle trop longue ?)."; try { vm.exit(1); } catch (Exception e) { } break; }
      set.resume();
    }
    int code = 0;
    try { code = p.waitFor(); } catch (Exception e) { }
    if (error == null && code != 0) error = "Le programme s'est terminé avec le code " + code + ".";
    Thread.sleep(50);
    String body = lastBody == null ? "\"line\":1,\"file\":\"\",\"frames\":[],\"heap\":{},\"statics\":[]" : lastBody;
    steps.add("{" + body.replaceFirst(",\"event\":\"[a-z]+\"", "") + ",\"event\":\"end\",\"out\":" + q(outText()) + "}");
    PrintStream ps = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    ps.print("{\"steps\":[" + String.join(",", steps) + "],\"error\":" + (error == null ? "null" : q(error)) + "}");
    ps.flush();
    System.exit(0);
  }

  // ---------- La sortie du programme (et ses erreurs), lue au fil de l'eau ----------
  static void drain(InputStream in) {
    Thread t = new Thread(() -> { byte[] b = new byte[4096]; int n; try { while ((n = in.read(b)) > 0) synchronized (out) { out.write(b, 0, n); } } catch (IOException e) { } });
    t.setDaemon(true); t.start();
  }
  static String outText() { synchronized (out) { return out.toString(StandardCharsets.UTF_8); } }

  static boolean ours(Location l) { return l != null && user.contains(l.declaringType().name()); }
  static String simple(String n) { return n.substring(n.lastIndexOf('.') + 1).replace('$', '.'); }

  // ---------- Une photo de la mémoire ----------
  static void snapshot(String event, String ret, String exc) throws Exception {
    heap = new LinkedHashMap<>();
    noInvoke = !event.equals("line");
    List<StackFrame> all = thread.frames();
    List<String> frames = new ArrayList<>();
    String line = "1", file = "";
    for (int i = all.size() - 1; i >= 0; i--) {
      StackFrame f = thread.frame(i);
      Location loc = f.location();
      if (!ours(loc)) continue;
      line = String.valueOf(loc.lineNumber());
      try { file = loc.sourceName(); } catch (AbsentInformationException e) { file = ""; }
      List<String> vars = new ArrayList<>();
      ObjectReference self = f.thisObject();
      if (self != null) vars.add(champ("this", val(self, 1)));
      f = thread.frame(i);
      try {
        List<LocalVariable> lv = f.visibleVariables();
        Map<LocalVariable, Value> vs = f.getValues(lv);
        for (LocalVariable v : lv) {
          if (v.name().equals("args") && loc.method().name().equals("main")) continue; // le tableau vide des arguments
          vars.add(champ(v.name(), val(vs.get(v), 1)));
        }
      } catch (AbsentInformationException e) { }
      frames.add("{\"func\":" + q(funcName(loc.method())) + ",\"line\":" + loc.lineNumber() + ",\"file\":" + q(file) + ",\"vars\":[" + String.join(",", vars) + "]}");
    }
    // les static des classes de l'exemple déjà chargées
    List<String> statics = new ArrayList<>();
    for (ReferenceType rt : userTypes) {
      for (Field fd : rt.fields()) if (fd.isStatic() && !fd.isSynthetic()) statics.add(champ(simple(rt.name()) + "." + fd.name(), val(rt.getValue(fd), 1)));
    }
    List<String> objs = new ArrayList<>();
    for (Map.Entry<Long, String> e : heap.entrySet()) if (e.getValue() != null) { objs.add(q(String.valueOf(e.getKey())) + ":" + e.getValue()); known.put(e.getKey(), e.getValue()); }
    String body = "\"line\":" + line + ",\"file\":" + q(file) + ",\"event\":" + q(event) + ",\"frames\":[" + String.join(",", frames)
      + "],\"heap\":{" + String.join(",", objs) + "},\"statics\":[" + String.join(",", statics) + "]";
    lastBody = body;
    // la sortie du pas : ce que le programme a écrit jusque-là (on laisse le tube se vider)
    Thread.sleep(2);
    steps.add("{" + body + ",\"out\":" + q(outText()) + (ret != null ? ",\"ret\":" + q(ret) : "") + (exc != null ? ",\"exc\":" + q(exc) : "") + "}");
  }
  static String funcName(Method m) {
    String c = simple(m.declaringType().name());
    if (m.isConstructor()) return c;
    if (m.isStaticInitializer()) return c + " (static)";
    String n = m.name().startsWith("lambda$") ? "lambda" : m.name();
    // dans la classe qui a le main : la méthode seule (carre) ; ailleurs : Compte.deposer
    return m.declaringType().methodsByName("main").isEmpty() ? c + "." + n : n;
  }
  static String champ(String nom, String v) { return "{\"nom\":" + q(nom) + ",\"v\":" + v + "}"; }
  static String t(String s) { return "{\"t\":" + q(s) + "}"; }

  // ---------- Une valeur ----------
  static String val(Value v, int d) {
    try {
      if (v == null) return "{\"nul\":true}";
      if (v instanceof StringReference s) return t("\"" + s.value() + "\"");
      if (v instanceof CharValue c) return t("'" + c.value() + "'");
      if (v instanceof PrimitiveValue) return t(v.toString());
      ObjectReference o = (ObjectReference) v;
      String cn = o.referenceType().name();
      if (BOXED.contains(cn)) { Value x = o.getValue(o.referenceType().fieldByName("value")); return x instanceof CharValue ? t("'" + x + "'") : t(String.valueOf(x)); }
      if (cn.equals("java.lang.StringBuilder") || cn.equals("java.lang.StringBuffer")) {
        if (noInvoke) return known.getOrDefault(-o.uniqueID(), t(simple(cn)));
        Value s = call(o, "toString", "()Ljava/lang/String;");
        String r = t("\"" + (s instanceof StringReference x ? x.value() : "") + "\"");
        known.put(-o.uniqueID(), r);
        return r;
      }
      long id = o.uniqueID();
      String r = "{\"ref\":\"" + id + "\"}";
      if (heap.containsKey(id) || d > NIVEAUX || heap.size() >= MAX_OBJETS) return r;
      heap.put(id, null);
      heap.put(id, obj(o, d));
      return r;
    } catch (Exception e) { return t("?"); }
  }
  static String obj(ObjectReference o, int d) throws Exception {
    String cn = o.referenceType().name();
    List<String> ch = new ArrayList<>();
    if (o instanceof ArrayReference arr) {
      int n = arr.length();
      for (int i = 0; i < Math.min(n, CASES); i++) ch.add(champ("[" + i + "]", val(arr.getValue(i), d + 1)));
      String comp = simple(((ArrayType) arr.referenceType()).componentTypeName());
      return objet(comp + "[" + n + "]", "tableau", ch, n);
    }
    boolean lib = false;
    for (String e : EXCL) if (cn.startsWith(e.substring(0, e.length() - 1))) lib = true;
    if (lib && o.referenceType() instanceof ClassType ct) {
      if (noInvoke) return known.getOrDefault(o.uniqueID(), objet(simple(cn), "objet", ch, 0));
      if (implementsIf(ct, "java.util.Collection")) {
        Value a = call(o, "toArray", "()[Ljava/lang/Object;");
        if (a instanceof ArrayReference arr) {
          for (int i = 0; i < Math.min(arr.length(), CASES); i++) ch.add(champ("[" + i + "]", val(arr.getValue(i), d + 1)));
          return objet(simple(cn), "liste", ch, arr.length());
        }
      } else if (implementsIf(ct, "java.util.Map")) {
        Value es = call(o, "entrySet", "()Ljava/util/Set;");
        Value a = es instanceof ObjectReference so ? call(so, "toArray", "()[Ljava/lang/Object;") : null;
        if (a instanceof ArrayReference arr) {
          for (int i = 0; i < Math.min(arr.length(), CASES); i++) {
            ObjectReference en = (ObjectReference) arr.getValue(i);
            ch.add(champ(text(call(en, "getKey", "()Ljava/lang/Object;")), val(call(en, "getValue", "()Ljava/lang/Object;"), d + 1)));
          }
          return objet(simple(cn), "dict", ch, arr.length());
        }
      }
      return objet(simple(cn), "objet", ch, 0); // les autres objets de la bibliothèque : une boîte fermée
    }
    for (Field f : o.referenceType().allFields()) if (!f.isStatic() && !f.isSynthetic()) ch.add(champ(f.name(), val(o.getValue(f), d + 1)));
    return objet(simple(cn), "objet", ch, 0);
  }
  static String objet(String classe, String kind, List<String> ch, int total) {
    return "{\"classe\":" + q(classe) + ",\"kind\":" + q(kind) + ",\"champs\":[" + String.join(",", ch) + "]" + (total > CASES ? ",\"total\":" + total : "") + "}";
  }
  static boolean implementsIf(ClassType ct, String name) { for (InterfaceType i : ct.allInterfaces()) if (i.name().equals(name)) return true; return false; }
  static Value call(ObjectReference o, String name, String sig) throws Exception {
    Method m = ((ClassType) o.referenceType()).concreteMethodByName(name, sig);
    return m == null ? null : o.invokeMethod(thread, m, List.of(), ObjectReference.INVOKE_SINGLE_THREADED);
  }
  // une valeur en texte court (valeur renvoyée, clé d'un dictionnaire)
  static String text(Value v) {
    if (v == null) return "null";
    if (v instanceof StringReference s) return "\"" + s.value() + "\"";
    if (v instanceof CharValue c) return "'" + c.value() + "'";
    if (v instanceof PrimitiveValue) return v.toString();
    String cn = ((ObjectReference) v).referenceType().name();
    if (BOXED.contains(cn)) { ObjectReference o = (ObjectReference) v; return String.valueOf(o.getValue(o.referenceType().fieldByName("value"))); }
    return simple(cn);
  }
  static String excText(ObjectReference e) {
    String msg = null;
    for (ReferenceType t = e.referenceType(); t instanceof ClassType ct; t = ct.superclass()) {
      Field f = t.fieldByName("detailMessage");
      if (f != null) { Value v = e.getValue(f); if (v instanceof StringReference s) msg = s.value(); break; }
    }
    return simple(e.referenceType().name()) + (msg != null ? ": " + msg : "");
  }

  // ---------- JSON ----------
  static String q(String s) {
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') b.append('\\').append(c);
      else if (c == '\n') b.append("\\n");
      else if (c == '\r') b.append("\\r");
      else if (c == '\t') b.append("\\t");
      else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
      else b.append(c);
    }
    return b.append('"').toString();
  }
}
