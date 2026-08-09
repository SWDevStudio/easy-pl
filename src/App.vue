<script setup lang="ts">
const links = [
  { to: "/events", label: "Осады" },
  { to: "/players", label: "Гильдия" },
  { to: "/stats", label: "Статистика" },
  { to: "/settings", label: "Справочники" },
];
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-primary/20 bg-base-100/80 border-b backdrop-blur">
      <div class="mx-auto flex w-full max-w-[100rem] items-center gap-6 px-6 py-3">
        <span class="font-display text-primary text-lg tracking-[0.3em] uppercase">easy&nbsp;pl</span>

        <nav class="flex gap-1">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="hover:text-primary rounded-sm px-3 py-1.5 text-sm tracking-wider uppercase transition-colors"
            active-class="text-primary bg-primary/10"
          >
            {{ link.label }}
          </RouterLink>
        </nav>
      </div>
      <div class="rule" />
    </header>

    <main class="mx-auto w-full max-w-[100rem] flex-1 px-6 py-6">
      <RouterView />
    </main>
  </div>
</template>
