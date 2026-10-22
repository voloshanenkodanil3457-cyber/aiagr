# Киноязык камеры и режиссура эмоций

## Базовый язык камеры (поддерживается напрямую)

| Тип | Термины |
| --- | --- |
| Крупность | extreme wide shot, wide shot, medium shot, close-up, extreme close-up |
| Движение | push in, pull out, pan, lateral move, follow shot, orbit, dive, dolly out, tilt up, handheld shake |
| Позиция/точка зрения | low angle, overhead view, first-person view |

## Популярные техники (можно писать напрямую, но уточнять субъект)

Если в кадре несколько субъектов — всегда указать, за кем следит/вокруг кого вращается камера, где движение начинается и заканчивается.

| Техника | Что указать |
| --- | --- |
| One-take shot (однокадровый) | Субъекты, пространства и события, через которые проходит непрерывная камера, по порядку |
| Dolly zoom | Какой размер субъекта сохранить и фон приближается или отдаляется |
| Aerial view | Высота, направление движения, какую территорию раскрыть |
| FPV | Маршрут пролёта от первого лица, скорость, повороты |
| Bullet time | Какое действие заморозить/замедлить и направление облёта |
| Handheld camera | За кем следим и степень тряски |
| Bounce speed ramp | Где ускорение/замедление/отскок и финальное состояние |

## Редкие/неоднозначные термины

Оставить термин + перевести его в наблюдаемое визуальное изменение:
```
Термин + Целевой субъект + Визуальное изменение + Отношение переднего/заднего плана + Направление или скорость
```
Пример: «Rack focus: shift focus smoothly from the leaves in the foreground to the person in the background. The leaves gradually blur while the person's face changes from soft to sharp.»

Значения диафрагмы/фокусного/выдержки писать можно, но видимый результат обычно понятнее числа.

## Примеры-эталоны

1. Малая ГРИП: «keep <Chef>'s eyes and face sharp while the glass jars and lights in the background become soft, circular bokeh».
2. Tracking shot: «move horizontally at the same speed as <Skateboarder>, keeping the subject sharp while the roadside wall forms horizontal motion blur from right to left».
3. Golden hour: «warm, low-angle sunlight enters from behind and to the left of <Hiker>, casting long shadows across the ridge».
4. Виньетка: «darken the four corners gradually while keeping the subject's brightness and skin tone natural in the center, without a black border».
5. Whip-pan: «at 5 seconds, move the camera rapidly to the left. Cut when the foreground bookshelf fully covers the frame, then continue moving left at a similar speed in the next scene».

## Физика движения (вес, инерция, реалистичное поведение объектов)

Для падений, ударов, резких остановок — недостаточно описать действие, нужно описать физическое поведение, иначе модель может дать неестественную траекторию (объект отскакивает, останавливается мгновенно, ткань не оседает). Формула:
```
<Объект> имеет <характер массы/веса>: <траектория движения> + <момент и характер контакта/удара> + <что происходит с зависимыми частями с задержкой> + <как гасится энергия>
```
Пример: «The helmet has real steel mass: it falls in a short arc, strikes the ground with a single dull impact, does not bounce beyond a small realistic settle, and its strap lags behind the shell's motion before settling a beat later.»

Для падения тела/персонажа: указать порядок, в котором подгибаются части тела (например, колени подгибаются первыми, торс оседает следом), и что ткань/волосы оседают под собственным весом с небольшой задержкой относительно тела.

Использовать только там, где физическая достоверность падения/удара/веса важна для сцены — не описывать физику там, где движение простое и очевидное (ходьба, спокойные жесты).



Слова «tense», «warm», «oppressive» задают направление, но оставляют модели свободу. Для стабильной актёрской игры добавлять видимые/слышимые сигналы: движение глаз, напряжение бровей, движение рта, дыхание, направление взгляда, движение рук. **Для одного эмоционального перехода достаточно 2–4 сигналов.** Событийные стадии — только если эмоция меняется несколько раз.

### Один эмоциональный переход
```
The overall emotion shifts from <starting emotion> to <ending emotion>.
After <triggering event>, <subject> first shows <immediate observable reaction>.
Then, <eyes, brows, mouth, breathing, gaze, or hand movement> gradually <changes>.
Finally, <subject> expresses <target emotion> through <restrained or explicit outward behavior>.
```

### Многоступенчатая эмоция через триггеры
```
When <subject> hears/sees <first triggering event>, <first observable reaction>.
When <second triggering event> occurs, <change in expression, gaze, or breathing>.
After confirming <critical information>, the emotion <subject> tries to restrain gradually becomes visible through <observable behavior>.
Finally, <subject's final action, expression, or manner of speaking>.
```

Эталонный пример: «Applause comes from behind the stage. The young actor's fingers suddenly stop on the program, the gaze turns slowly toward the curtain, and the shoulders remain tense. After confirming the curtain call is over, the actor exhales softly. The shoulders gradually relax, a restrained smile appears, and the eyes slowly well with tears, but the actor never turns to leave.»

Полезный приём из формулы 30-сек видео: после физических инструкций давать «Emotion Analysis» — объяснить модели ГЛУБИННЫЙ смысл действий (что персонаж на самом деле чувствует), это заметно улучшает игру.
