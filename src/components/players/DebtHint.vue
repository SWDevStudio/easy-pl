<script setup lang="ts">
import { UiTooltip } from "@/components/ui";
</script>

<template>
  <UiTooltip label="Как считается долг" panel-class="max-w-sm">
    <span class="block font-semibold">Долг — насколько игрок недобрал осад</span>

    <p class="text-muted mt-1">
      Это разница между тем, сколько осад ему причиталось по справедливости, и тем, сколько он реально
      отходил. Чем больше долг, тем выше его вес в жеребьёвке.
    </p>

    <ul class="mt-2 space-y-1">
      <li><span class="text-success font-medium">Больше нуля</span> — недобрал, пойдёт вне очереди</li>
      <li><span class="text-muted font-medium">Меньше нуля</span> — сходил больше своей доли</li>
      <li><span class="font-medium">Ноль</span> — ровно свою долю</li>
    </ul>

    <p class="text-muted mt-2">
      Заявился и не прошёл — долг растёт на долю свободных мест. Прошёл — уменьшается на остаток. Не
      заявился — не меняется вовсе, поэтому пропуски сами по себе ничего не копят.
    </p>

    <p class="text-muted mt-2">
      <span class="text-base-content">Прошёл по жребию — явка не важна.</span> Очередь потрачена, пришёл
      ты или нет, поэтому прогульщик опускается сам собой.
    </p>

    <p class="text-muted mt-2">
      Кто прошёл вне жребия — приоритетный или заменивший — при явке долг не меняет вовсе. А вот за
      прогул с него списывается
      <span class="text-error">вдвое больше обычного</span>: место было гарантированным и пропало зря.
    </p>

    <p class="text-muted mt-2">
      Пересчитывается при закрытии осады, ограничен ±10. Значение можно поправить вручную прямо в
      списке гильдии.
    </p>
  </UiTooltip>
</template>
