# Продвинутые режимы

## 1. Первый/последний кадр + доп. референсы

В мультиреференсном режиме можно первой строкой объявить @Image 1 первым кадром, @Image 2 — последним (не обязательно отдельный режим First/Last Frames). Соотношение сторон лочится по первому изображению; длительность задаётся в интерфейсе/API. **Первый и последний кадр — одинаковое соотношение сторон**, иначе последний растянет.

```
@Image 1 is the first frame. It defines the opening composition, subject position, pose, prop state, scene, and camera direction.
@Image 2 is the last frame. It defines the ending composition, subject position, pose, prop state, scene, and camera direction.
@Image 3 defines <attributes> of the subject shown in @Image 3. Do not change the first-frame composition defined by @Image 1 or the last-frame composition defined by @Image 2.
<Одно непрерывное действие/событие с @Image 3>.
The video begins naturally from the first frame defined by @Image 1 and reaches the last frame defined by @Image 2 after the continuous action.
Between the first and last frames, maintain continuity in <character identity, prop structure and ownership, scene layout, and camera direction>.
```
Каждый якорный кадр описывать отдельно. НЕ писать «@Images 1 and 2 are the first and last frames» одной фразой.

## 2. Мульти-кейфреймы (последовательность стадий)

```
Use @Image 1 through @Image N as keyframes in this order.
@Image 1 is the first frame: <открывающая композиция...>.
@Image 2 defines the second keyframe: <видимое конечное состояние стадии 1>.
...
@Image N is the last frame: <финальная композиция...>.
The video passes through the states defined by @Image 1...@Image N in order, using continuous action to transition naturally between stages.
Maintain continuity in <subject identity, prop structure, scene layout, lighting, and axis of action> throughout.
```
Отдельные кейфрейм-изображения выравниваются лучше, чем сетка из нескольких кадров в одной картинке. Кейфреймы задают порядок стадий и ключевые состояния, а не покадровое воспроизведение.

## 3. Раскадровка-сетка (Storyboard Grid)

Сетка передаёт историю, порядок кадров и примерные композиции — НЕ точное воспроизведение каждой панели. Рекомендации: ≤15 панелей, чистый лайн-арт или простые схемы/стикмены, минимум текстовых подписей.
```
@Image 1 provides an <N-panel storyboard grid> for shot order and approximate composition. Read it <left to right, top to bottom>. Do not use the grid's line-art style, text labels, or placeholder characters.
@Image 2 defines a subject's appearance and clothing.
Shot 1: <крупность, действие субъекта, состояние сцены>.
Shot 2: <крупность, действие, движение камеры или переход>.
...
The final video uses <visual style>. Audio includes <...>.
```
Порядок написания: что представляют панели → главный сеттинг с референсами персонажей → покадровое описание (композиция, крупность, камера, действие) → глобальный стиль и запреты.

## 4. White Model / Blockout / Clay Renderer

Два типа болванок — сначала определить, какой перед тобой:

| Тип | Что даёт | Требования к материалу | Фокус промпта |
| --- | --- | --- | --- |
| Coarse (грубая геометрия: сферы, цилиндры, кубы) | Временнáя информация: траектории, блокинг, камера, склейки, свет, ритм звука | Ясные отношения форм, полная последовательность действий | Замаппить каждую болванку на финальный субъект + указать, что наследовать |
| Fine (полная модель со структурой) | Ре-рендер: материалы, цвета, персонажи, сцена, стиль | Чистая модель без линий траекторий, осей координат, фрустумов камеры | Сохранить структуру/действие/камеру + описать, что перерендерить |

### Coarse blockout — шаблон
```
@Video 1 is a coarse blockout reference. It provides only <motion paths, subject blocking, camera position, camera movement, cuts, lighting changes, sound rhythm, or spatial relationships>. Do not use its blockout appearance, materials, or scene.
The tall cylinder in @Video 1 corresponds to the subject defined by @Image 1.
The rectangular block in @Video 1 corresponds to the prop defined by @Image 2.
@Image 1 defines <appearance...> of that subject.
@Image 1 completes <action> in <scene>.
Keep the <motion path, blocking, camera movement, cuts, lighting, sound rhythm> from @Video 1.
The final video uses <style>. Audio includes <...>.
```
Если у болванки есть конечности/крылья — прописать ПОЛНУЮ последовательность их движений, иначе скованность. Лучшая практика — вообще не загружать болванки с конечностями.

### Fine blockout — шаблон
```
@Video 1 is a fine blockout reference. Preserve <subject structure, action, spatial layout, camera position, camera movement, and cuts>. Do not use its original gray materials or empty background.
@Image 1 defines <материал/цвет/поверхность>.
Re-render <subject> from @Video 1 as <final subject>, and re-render the scene as <final scene>.
Segmented rendering (по желанию): 0-{N}s: <требования к рендеру — среда, тон, материал персонажа, свет>; {N}s <точка и способ перехода>: <рендер новой сцены>.
Keep <structure, action, camera treatment, spatial relationships> from @Video 1. Audio: <...>.
```
Плагин Dreamina для Maya/Blender позволяет выгрузить болванку с камерой прямо на веб-версию.

## 5. One-Click Video (сборка ролика из пачки картинок)

Не писать «сделай из этих материалов видео». Структура: **Роли материалов → Порядок картинок → Объём движения → Стиль монтажа → Визуальная обработка → Аудио**
```
[Material Roles]
@Image 1 is used for <opening environment / character / product>.
...
@Video 1 is used only for <editing rhythm, transitions, subtitle treatment, or music style>. Do not use its character identities or scene.

[Arrangement]
Show the images in <upload order / specified order / model-selected thematic order>. <Что должно остаться консистентным>.

[Image Motion]
Apply <subtle live motion, parallax, push-in/pull-out, lateral movement, or local action> to each image. Keep <структура продукта, текст, фон> stable.

[Final Style]
Use <editing rhythm, transition style, subtitle/graphic treatment, color style>.

[Audio]
Include <dialogue, ambience, sound effects, or music>.
```
Если порядок и маппинг персонажей важны — задать явно; иначе разрешить модели сгруппировать тематически.

## 6. Бесшовная склейка двух видео (Seamless Video Transitions)

Модель генерирует мост между двумя НЕизменяемыми клипами. Структура: **Видео-до → Видео-после → Триггерное действие → Движение камеры → Визуальная трансформация → Состояние прибытия → Аудио-переход**
```
@Video 1 is the before-transition clip. Use its <ending subject, action, composition, camera direction, and audio>.
@Video 2 is the after-transition clip. Use its <opening subject, composition, camera direction, and audio>.
Keep <identity, structure, scene, primary action> stable in the original portions of @Video 1 and @Video 2; do not modify the two uploaded videos.
At the end of @Video 1, <subject/foreground object> triggers the transition through <action>.
The camera <направление и изменение скорости>, while <форма, материал, свет, пространство> gradually transforms into <соответствующий элемент> at the start of @Video 2.
The transition ends naturally at @Video 2's opening composition, preserving continuity in <subject position, camera direction, and motion trend>.
Audio transitions smoothly from <before audio> to <after audio>.
```
Способы моста и что указывать: dive/reverse (направление и скорость камеры, момент начала новой сцены); поворот персонажа (поза, направление вращения, как меняются одежда/фон); перекрытие передним планом (когда объект заполняет кадр и какая композиция дальше); морфинг объекта (соответствующие формы и материалы); push/pull или смена фокуса. Мост — генерация, не пиксельная склейка.

## 7. Green Screen

Загрузить видео с зелёным фоном + описать новую сцену (текстом или @референсом):
```
Replace the background with <новая сцена / @Image 1 / @Video 2>, naturally integrate the green-screen characters into it, matching perspective, lighting, and shadows.
```
Умеет: точная сегментация сложных контуров без ореолов, стабильность движения персонажа относительно нового фона, композитинг нескольких видео («Composite @Video 1 and @Video 2 into @Video 3...»).

## 8. Генерация только по аудио

Вход «только аудио» (без картинок/видео) поддерживается в Seedance 2.5, недоступен в 2.0 — можно строить ролик от готового трека/голоса только в 2.5.
