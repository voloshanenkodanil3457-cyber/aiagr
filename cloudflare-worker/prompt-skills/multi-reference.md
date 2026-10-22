# Мультиреференсная генерация (до 50 материалов)

Цель мультиреференса — помочь модели ВЫБРАТЬ правильные материалы для каждой сцены, а не заставить все материалы появиться одновременно.

Официальный порядок работы:
**Роль каждого материала → Маппинг субъектов → Группировка по типам → Профили ключевых субъектов → Выбор референсов посценно**

## Шаг 1. Роль каждого субъекта отдельно (без имён — только `@`)

```
@Image 1 defines a character's appearance, hairstyle, and clothing.
@Image 2 defines a second character's appearance, hairstyle, and clothing.
@Image 3 defines a prop's structure, material, and color.
@Image 4 defines a scene's spatial layout, architecture, and lighting. Do not use the people in the image.
```
ЗАПРЕЩЕНО: «@Images 1 through 4 define four characters respectively» — не указано, кто есть кто. Роль каждого номера — отдельной строкой. Не присваивай субъекту имя в `<>` ни на этом шаге, ни дальше — во всех последующих упоминаниях (шаги 2–4 и финальный промпт) субъект называется тем же `@Image N` / `@Video N` / `@Audio N`, каким был обозначен здесь.

## Шаг 2. Группировка по типам

```
[Characters]
@Image 1 defines a character's appearance, hairstyle, and clothing.
@Image 2 defines a second character's appearance, hairstyle, and clothing.
Do not interchange the characters' appearances, clothing, actions, positions, or dialogue.

[Props]
@Image 5 defines a prop's structure, material, and color. It belongs only to the character from @Image 1.

[Scenes]
@Image 7 defines the space, materials, and lighting. Do not use the people in the image.

[Motion and Audio]
@Video 1 defines the motion of the character from @Image 1 opening the prop from @Image 5. Do not use the person or scene from the video.
@Audio 1 defines a character's voice and specified dialogue.
```

## Шаг 3. Профиль ключевого субъекта (если персонаж проходит через несколько сцен)

```
[Subject Profile: @Image 1]
Appearance and clothing: @Image 1.
Fixed prop: @Image 5.
Locations: @Image 7 and @Image 8.
Motion references: the case-opening motion from @Video 1.
Do not use: other characters' clothing. Do not give this character the prop from @Image 9.
```

## Шаг 4. Выбор референсов посценно

```
Scene 1 | Inspection in the Conservation Lab
Use: @Image 1, @Image 5, @Image 7, and the case-opening motion from @Video 1.
Event: @Image 1 opens @Image 5 at the workbench and inspects the sample.
End state: @Image 1 remains on the inner side of the workbench. @Image 5 stays beside the right hand.
```

## Шаблон ролей (компактный вариант для простых задач)

```
@Image 1 defines <appearance, clothing, structure, or material>. Do not use the image background.
@Video 1 defines <motion, camera movement, or pacing>. Do not use the person's identity, clothing, or scene from the video.
@Audio 1 defines <voice, dialogue, ambience, or music>.
@Image 1 completes <primary action or event> in <scene>.
The visuals feature <visual style>, with <camera treatment>.
```

## Несколько ракурсов одного объекта

Явно указать, что это ОДИН объект:
```
@Image 1 defines the front view of the same folding desk lamp.
@Image 2 defines the left-side structure of the same folding desk lamp.
...
All images define one folding desk lamp. The output must contain only one lamp throughout.
```
Если субъектов больше 5 и нужны разные ракурсы — раскладывать ракурсы по отдельным изображениям (отдельные виды стабильнее, чем коллаж из нескольких видов в одной картинке).

## Референс-видео с движением

Если референс-видео уже точно задаёт движение/камеру/последовательность — указать только, какие атрибуты наследовать; НЕ пересказывать каждое действие (пересказ может конфликтовать с самим референсом). Blockout-видео даёт только движение и пространство — субъектов, сцену, стиль всё равно описать текстом.

## Перенос «креатива» (Transfer Ideas)

Seedance 2.5 умеет переносить из референс-видео не только движение, но и киноязык: траекторию камеры, свет, атмосферу, «вирусную» ритмику соцсетей. Формула: @референс-видео + подробно описать, какую суть переносим (ритм, комедийный эффект, «premium feel») и что заменяем:
```
Please reference the creative form, camera rhythm, and transition method of @Video 1. <новый субъект/контент>...
```

## Мультиперсонажные сцены (анти-«близнецы» и анти-«сшитый монстр»)

Seedance 2.5 особенно хорошо держит независимость лиц, одежды и тел нескольких персонажей. Правила промпта:
- Каждому персонажу — свой референс и явная привязка (шаг 1–2).
- Указывать позиции, действия и отношения: «The character from @Image 1 and the character from @Image 2 are sitting by the campfire talking, @Image 1 hands @Image 2 a glass of water».
- Явный запрет на обмен чертами и одеждой.
- Работают сложные физические взаимодействия: объятия, борьба, перекрытия в пространстве.

## Аудио-референсы (Tone Reference)

- Загружать чистый голос без шума.
- В промпте: `Reference @Audio 1, say {реплика}, maintain a low and suspenseful tone` — модель переносит и тембр, и эмоцию/интонацию референса.
- Можно комбинировать с эмоциональными командами для точного контроля.
- Разделение звука: «Remove the background music in @Video 1, retaining the clear human voice» — BGM убирается без потери голоса и субтитров в кадре.
