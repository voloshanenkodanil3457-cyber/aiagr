# Редактирование видео: Smart Edit, Edit with marks, Edit Video

Три функции:
- **Smart Edit** — загрузить видео + текстовый промпт с правками.
- **Edit with marks** — после загрузки видео активируются инструменты разметки (рамки, стрелки, кисть, якорные точки) для точечного указания зоны правки.
- **Edit Video** — то же для уже сгенерированных видео.

Автоблокировки: редактирование сохраняет соотношение сторон и примерно длительность исходника (возможна разница до ~0.3 сек) — их нельзя задать отдельно.

## Главный принцип

Сначала объявить исходное видео ЕДИНСТВЕННЫМ мастером редактирования, затем: цель правки, охват правки, целевой материал, что сохранить.

### Общий шаблон
```
[Edit Goal]
Edit @Video 1. Within <the entire video / time range>, <add/remove/replace/adjust> <object, region, or audio category>.

[Source Video Role]
@Video 1 is the sole editing master. It defines <characters, scene, actions, composition, camera movement, occlusion relationships, audio, and event order>.

[Target Material Role]  (если есть референс цели)
@Image 1 or @Audio 1 defines <specified attributes of the target object or sound>.

[Edit Scope]
Modify only <object, region, time range, or audio category>.

[Content to Preserve]
Keep <visual content, motion, audio, and timing relationships that must not change> from @Video 1.
```

### Формула текстовой правки (обязательный костяк)
```
[Конкретный объект правки] + [Действие и описание изменения] + [Тайминг действия]
```
- Объект (lock target): «the boy's jeans», «the dead tree in the background»
- Изменение A→B: «replace with dark black suit pants», «turn it into a blooming cherry tree», «remove and seamlessly complete the background»
- Тайминг: «throughout the entire video to maintain consistency» / «only between seconds 5 and 8» / «gradually appears from second 3»

Ключевые глаголы: Edit / Add / Delete / Remove / Modify / Replace / Change to.

## Замена субъекта (Subject Replacement)

```
[Edit Goal]
Edit @Video 1. Change only <original object> to <target object>.

[Source Video Role]
@Video 1 is the sole editing master. It defines the original scene, camera position, camera movement, motion path, occlusion relationships, and event order.

[Target Reference Role]
@Image 1 defines <target object>'s <appearance, structure, or material>. Do not use <irrelevant background, people, or composition>.

[Edit Scope]
Modify only <specific object and area>. The entire video contains <number> target object(s). Do not modify <content to preserve>.

[Timeline Inheritance]
<Target object> inherits every appearance, motion, occlusion, and exit of <original object>, including timing, duration, path, and speed changes.
Except for the object explicitly modified above, keep all other people, props, scene content, camera movements, cuts, and event order from @Video 1 unchanged.
```
Важно: указать количество целевых объектов («Keep exactly one white desk lamp throughout»), иначе возможно дублирование.

## Замена фона (Background Replacement)

```
Edit @Video 1. Replace only <original background area> with <target environment> from @Image 1.
@Video 1 is the sole editing master: people, foreground objects, actions, composition, camera movement, event order.
@Image 1 defines only <target environment>'s spatial layout, materials, depth of field, ambient color, and lighting direction. Do not use the people in the image.
Modify only <background outside the subject's silhouette>. Do not modify <subject identity, facial features, hairstyle, clothing, expression, position, size, or motion>.
Keep the character actions and occlusion relationships from @Video 1; keep everything else unchanged.
```

## Аудиоправки

Диалог, язык, голос, музыка и SFX правятся раздельно. Указать: категорию звука/говорящего, изменение, что оставить:
```
Edit @Video 1. Remove only the original background music. Keep the character dialogue, lip sync, ambience, and action sound effects; preserve the visuals, camera treatment, and editing rhythm from @Video 1.
```
```
Edit @Video 1. Change <Presenter>'s spoken language to natural American English while preserving the dialogue content and speaking times. Keep all other character voices, background music, ambience, and visuals from @Video 1.
```

## Edit with marks (разметка на кадре)

Формула: **[Инструмент разметки и ориентация] + [Объект] + [Изменение] + [Тайминг]**
- Инструменты: рамка (box), линия, стрелка, текст, якорные точки разных цветов, ластик.
- Указать, каким инструментом отмечено и где смотреть: «within the red box», «follow the area pointed by the red arrow», «to the left of the red line».
- После разметки нажать «✅ Add to Input Box» — в поле появится метка с таймкодом (например «⏱️ 00:00 Video Frame Labeling»), затем Generate.

Пример: «Within the red box: change the boy's pants to black; modify the pants' color throughout the entire video to maintain consistency.»

## Локальное удаление и смена ракурса

- Удаление без следов: «Eliminate passersby on the right side of the screen» — модель дорисует фон по физике света исходника. Замена: «Replace the water cup on the table with a bouquet of red roses».
- Смена перспективы (3D-переосмысление): «Change the eye-level shot to a high-altitude shot, camera slowly pushes downward», «Change the third-person perspective of @Video 1 to first-person perspective», «Replace the multi-camera switching shots in @Video 1 with a fixed frontal shot, keep the characters and background unchanged». Модель достраивает пространство за кадром.
