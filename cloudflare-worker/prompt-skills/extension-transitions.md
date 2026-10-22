# Продление видео (Video Extension, только Seedance 2.5) и библиотека переходов

## Продление — доступно только в Seedance 2.5

В Seedance 2.0 режима «Extend Video» нет — максимум 15 секунд за одну генерацию; переходы применяются только **внутри** этого ролика, между его отрезками (см. «Переход/склейка между сценами» ниже). Всё, что описано в этом разделе про продление, актуально только для Seedance 2.5.

## Механика продления (Seedance 2.5)

- Кнопка «Extend Video» под роликом → указать длительность продления (4–30 сек) → промпт → Generate.
- «Матрёшка»: пока текущий ролик ≤30 сек, его можно продлевать снова и снова. Максимум итог: 30с исходник + 30с продление = 60 сек.
- Автоблокировка: соотношение сторон исходника сохраняется; длительность продления задаётся.
- Сценарии: сюжетный твист по таймингу, «эстафетная» сборка сложного движения по кускам (нарисовал меч → выпад → разворот), проход камеры сквозь зеркало в новый мир.

## Ключевые слова обычного продления

Forward extension / Backward extension / Continuation + всегда добавлять анти-артефактные ограничения:
```
Require natural extension, smooth movement connection, natural action connection, prohibit rigid cuts, prohibit objects appearing out of thin air.
```

## Продление вперёд (после исходника)

Сначала описать непрерывное состояние ПОСЛЕДНЕГО кадра исходника, затем — что происходит дальше.
```
@Video 1 is the source video to extend forward.
Extend @Video 1 forward. The first frame of the extended segment directly continues from the last frame of @Video 1.
Maintain continuity in <subject pose and orientation>, <prop position>, <background and spatial relationships>, <camera position and composition>, <lighting>, and <motion direction>.
Then, <новое действие/событие/камера/звук>.
Throughout the extension, maintain continuity in <character identity and clothing>, <key props>, <background layout>, and <axis of action>.
Keep each subject as the same continuous instance throughout: do not duplicate or split it.
```
С доп. референсами: сначала роли всех новых материалов, затем указать, что границей управляет исходник — новые материалы дополняют персонажей/пропы/звук, но НЕ переопределяют первый кадр продления.

## Продление назад (до исходника)

Сначала описать, что происходит ДО начала исходника, затем явно объявить первый кадр исходника конечным состоянием продления (иначе поздние персонажи/эффекты появятся слишком рано, или картинка «поедет» после стыка).
```
@Video 1 is the source video to extend backward.
Extend @Video 1 backward. Before the source video begins, <предшествующее действие/событие>.
The last frame of the extended segment naturally connects to the first frame of @Video 1: <subject pose and orientation>, <prop position>, <background>. Match the <camera position and composition>, <lighting>, and <motion direction> of @Video 1's first frame.
Keep each subject as the same continuous instance throughout.
<Материалы, которые должны появиться только после начала исходника> must not appear early in the backward extension.
```
Проверка после генерации: граница стыка с обеих сторон + весь продлённый кусок (персонажи, пропы, фон, события). Стык естественный визуально, но не пиксельно-идентичный.

## Переход/склейка между сценами (работает в обеих версиях — внутри ролика для 2.0, при продлении или между отрезками для 2.5)

Если один отрезок/продолжение — не то же действие, а новая сцена, добавить конструкцию склейки:
```
Cut setting = [Тип перехода] + [Базовые ограничения] + [Логика склейки]
```
1. [Тип]: «You need to use "<название перехода>" transition at the cut point (prohibit rigid cuts, prohibit objects appearing out of thin air).»
2. [Базовые ограничения]: держать дыхание и длительность кадров согласованными; описать Shot A → Shot B.
3. [Логика]: «It is required to switch scenes naturally.» Опционально описать смену крупности: «and the shot changes from close-up to medium shot».

Можно дать модели выбор: «Please choose the most suitable transition for this film from: natural shot switching / mask transition / ink transition / similar object transition.»

## Библиотека переходов (официальная)

| Переход | Что это | Когда использовать |
| --- | --- | --- |
| Natural shot switching | Прямая склейка A→B, но с «дыханием» камеры и достаточным временем на переключение, без жёсткого обрыва | Большинство обычных нарративов |
| Fade in/out | Кадр уходит в чёрное/белое, следующий проявляется | Начало/конец, прошествие времени, конец сюжетной линии |
| Stacking (наплыв) | A становится прозрачным, B проявляется, 1–2 сек наложения | Воспоминания, сны, лиричные переходы |
| White/black flash | Мгновенная вспышка белого/чёрного и резкий переход | Клипы под бит, экшн, драматичный акцент (удар, выстрел) |
| Erase (вытеснение) | B «сдвигает» A как дверь с одной из сторон | Ретро-стиль (Star Wars), явная смена локации |
| Mask transition | Камера упирается в объект (стена, спина, ладонь) → чернота → выход в новую сцену | Перемещение сквозь пространство/миры |
| Similar object transition | Последний кадр A по форме/цвету совпадает с первым кадром B (луна → латте) | Монтажные метафоры |
| Action transition (whip pan) | Резкий мах камеры с motion blur в A, выход из блюра тем же движением в B | Экшн, паркур, тревел-влоги, «телепорт» |
| Dynamic relay | Действие персонажа связывает сцены: выпрыгнул из кадра в A — упал в кадр в B (уже в другой одежде/месте) | Переодевания, перемещения между локациями |
| Zoom in/out transition | Бесконечный зум в деталь (зрачок, замочная скважина) — деталь становится всей сценой B | Масштабные нарративы, «мир в мире» |
| Ink painting transition | Кадр растворяется как тушь в воде, из разводов проявляется новый | Восточная эстетика, ханьфу, исторические сюжеты |

Каждый переход в промпте оформлять по трёхчастной формуле выше; для точного контроля описывать конкретику сцен A и B.

## Бесшовная склейка двух готовых видео — см. advanced-modes.md (Seamless Video Transitions)
