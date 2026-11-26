/* Le pas à pas C/C++ de l'IDE des cours (ide-gdb.js) : la table des blocs du tas, lue par gdb à chaque pas. Compilée
   avec le programme, seulement pour le pas à pas (ide.js) : malloc, calloc, realloc et free du code de l'exemple sont
   enveloppés (-Wl,--wrap=…), new et delete remplacés en C++ (g++ compile ce fichier en C++). On sait ainsi ce qui est
   vraiment dans le tas, sa taille, ce qui est libéré, ce qui fuit. hito_fin : appelée à la sortie du programme, le
   traceur s'y arrête pour lire la table telle que le programme la laisse. */
#include <stddef.h>
#include <stdlib.h>

#define HITO_MAX 2048
struct hito_bloc { unsigned long long p, n; int vivant, pad; };
struct hito_table { unsigned int ver, n; struct hito_bloc b[HITO_MAX]; };
struct hito_table hito_tab;

#ifdef __cplusplus
extern "C" {
#endif
void *__real_malloc(size_t n);
void *__real_calloc(size_t k, size_t n);
void *__real_realloc(void *o, size_t n);
void __real_free(void *p);

static void hito_add(void *p, size_t n) {
  struct hito_bloc *b;
  if (!p) return;
  if (hito_tab.n == HITO_MAX) { /* pleine : les blocs libérés partent */
    unsigned int i, j = 0;
    for (i = 0; i < hito_tab.n; i++) if (hito_tab.b[i].vivant) hito_tab.b[j++] = hito_tab.b[i];
    hito_tab.n = j;
    if (j == HITO_MAX) return;
  }
  b = &hito_tab.b[hito_tab.n++];
  b->p = (unsigned long long)(size_t)p; b->n = n; b->vivant = 1;
  hito_tab.ver++;
}
static void hito_del(void *p) {
  unsigned int i;
  if (!p) return;
  for (i = hito_tab.n; i-- > 0;)
    if (hito_tab.b[i].vivant && hito_tab.b[i].p == (unsigned long long)(size_t)p) { hito_tab.b[i].vivant = 0; hito_tab.ver++; return; }
}
void *__wrap_malloc(size_t n) { void *p = __real_malloc(n); hito_add(p, n); return p; }
void *__wrap_calloc(size_t k, size_t n) { void *p = __real_calloc(k, n); hito_add(p, k * n); return p; }
void *__wrap_realloc(void *o, size_t n) { void *p = __real_realloc(o, n); if (p || !n) hito_del(o); hito_add(p, n); return p; }
void __wrap_free(void *p) { hito_del(p); __real_free(p); }

void __attribute__((noinline)) hito_fin(void) { hito_tab.ver++; }
static void __attribute__((constructor)) hito_debut(void) { atexit(hito_fin); }
#ifdef __cplusplus
}

#include <new>
/* comme le new standard : en manque de mémoire, la fonction de set_new_handler (le cours s'en sert), sinon bad_alloc */
static void *hito_new(size_t n) {
  for (;;) {
    void *p = __real_malloc(n ? n : 1);
    if (p) { hito_add(p, n); return p; }
    std::new_handler h = std::get_new_handler();
    if (!h) throw std::bad_alloc();
    h();
  }
}
static void hito_delete(void *p) { hito_del(p); __real_free(p); }
void *operator new(size_t n) { return hito_new(n); }
void *operator new[](size_t n) { return hito_new(n); }
void operator delete(void *p) noexcept { hito_delete(p); }
void operator delete[](void *p) noexcept { hito_delete(p); }
void operator delete(void *p, size_t) noexcept { hito_delete(p); }
void operator delete[](void *p, size_t) noexcept { hito_delete(p); }
#endif
