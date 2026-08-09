import { createRouter, createWebHashHistory } from "vue-router";

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/events" },
    {
      path: "/events",
      name: "events",
      component: () => import("@/pages/PageEvents.vue"),
    },
    {
      path: "/events/:id",
      name: "event",
      component: () => import("@/pages/PageEvent.vue"),
    },
    {
      path: "/stats",
      name: "stats",
      component: () => import("@/pages/PageStats.vue"),
    },
    {
      path: "/players",
      name: "players",
      component: () => import("@/pages/PagePlayers.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/pages/PageSettings.vue"),
    },
  ],
});

export default router;
