# Мультисегментное видео (Seedance 2.0: до 15 сек) / длинное видео 30 сек (Seedance 2.5): стадии и таймстемпы

## Принцип стадий и конечных состояний

Если в видео несколько событий — разбить историю на последовательные стадии. **Одна стадия = одно главное изменение состояния + явное конечное состояние** (что должно быть видно в кадре в конце стадии).

### Шаблон длинного видео
```
[Generation Goal]
Generate a <video type>. The central subject is <subject>, and the primary event is <story summary>.

[Stage 1]
Initial state: <initial state of characters, props, and scene>.
Primary event: <one primary action or event>.
End state: <character positions, prop ownership, or visible scene state>.

[Stage 2]
Continue from the previous stage: <state that must remain unchanged>.
Primary event: <one primary action or event>.
End state: <observable state>.

[Stage 3]
Primary event: <closing event>.
End state: <final visible state>.

[Maintain Consistency]
Keep <character identity, number of characters, clothing, prop ownership, spatial direction, and audio relationships> consistent.
```

## Таймстемпы и контроль темпа

Для обычного нарратива — по умолчанию стадии. Секундную точность использовать только для критичных моментов: передача предмета, вход/выход из кадра, переход, бит музыки.

| Паттерн | Пример |
| --- | --- |
| Диапазон | `0-3 seconds... 3-7 seconds... 7-12 seconds...` |
| Точная точка | `At 5 seconds, the camera whip-pans rapidly to the left and completes the transition.` |
| Относительное время | `Three seconds after the character presses the button, the room lights gradually turn off.` |

Правила таймстемпов:
- Диапазоны — последовательные и без наложений.
- Диапазон — это «бюджет времени» события, а не точный монтажный срез: действие может начаться/закончиться чуть раньше/позже границы.
- Слишком мало контента в диапазоне → модель больше импровизирует; слишком много → лишние склейки или пропуск событий.
- НЕ требовать частоту («три действия за одну секунду»).
- Формат маркера в тексте: `[00.0-05]` перед кадром/репликой/действием, писать сценарий хронологически.
- Альтернативная запись — в кадрах при 24 fps (например «Frames 0-90 (0s-3s)») — тоже поддерживается.

Где таймстемпы особенно полезны: мультишотовые сценки с переключением ракурсов (чтобы кадры «не проматывались»), клипы под бит музыки, реклама с поэтапной демонстрацией продукта (первые 5с — внешний вид, середина — функции, финал — эффект).

## Официальная формула 30-секундного видео (3 модуля)

Однострочный тон всего видео + 3 модуля:

**Модуль 1 — [Слой мультимодальных референсов]** (пропустить, если референсов нет):
```
Based on the uploaded [materials], strictly maintain the consistency of the character's [face/features] in @Image 1,
maintain the consistency of the [composition/blockout/spatial relationships] in @Image 2, and strictly lock the character's position.
```
@-ссылки можно повторять по ходу текста несколько раз — это повышает точность.

**Модуль 2 — [Глобальные настройки] (мир + анти-развал):**
1. Базовая среда и текстура: [время] + [место] + [атмосфера] + (опц. «emphasize ultimate real physical texture»)
2. Визуальный стиль: [cinematic/realistic/2D...] + [глубина резкости] + [схема света]
3. Язык камеры: [крупность/ракурс] + [детали]
4. Образ персонажа: формула из characters.md ИЛИ @референс + описание
5. Ядро перформанса: что критично для результата
6. Запреты: [звук] + [субтитры] + [поведение] + [места, где модель обычно «разваливается»]. Пример: «prohibit large body movements, prohibit extra lines or BGM, prohibit subtitles»

**Модуль 3 — [Таймстемп-раскадровка]:**
Разрезать видео на тайм-слоты, для каждого:
1. [начало-конец сек] + [ядро фазы/тема]
2. [действие/выражение и другие физические инструкции]: сцена + композиция + детальное действие персонажа
3. [эмоциональный разбор или постановка камеры]: объяснить модели глубинный смысл физических инструкций

Пример структуры фазы:
```
Stage 1: 0-3s [Questioning] — Reluctant Waiting
Action/Expression: The camera focuses on her face. She looks directly into the lens... whispers softly: {Are you really leaving?}
Emotion Analysis: Direct gaze — she is not complaining, but waiting for him to confirm an answer she already guessed.
```

## Ultra Long Video (только Seedance 2.5, 30–180 сек)

В Seedance 2.0 этот режим недоступен — там максимум 15 секунд за одну генерацию, разбитых на стадии/отрезки, как описано выше. В Seedance 2.5 есть отдельный режим «Long Video» в интерфейсе: выбрать режим → выставить длительность (до 180s) → детальный сценарий → Generate. Генерируется одним куском, модель держит консистентность персонажей/одежды/сцены на всей длине и плавные длинные движения камеры.

Формула:
```
Полный промпт = [Глобальные параметры] + [Описание референсов] + [Однострочное резюме] + [Поплотовое описание] + [Глобальное дополнение]
```
- **[Глобальные параметры]**: из-за большой длительности продублировать в начале промпта длительность и соотношение сторон, даже если они выбраны в интерфейсе: «Full length 3 minutes, video aspect ratio 16:9, ...»
- Дальше — как в расширенной базовой формуле (референсы → резюме → таймлайн с ➕/➖ → глобальное дополнение).

Подходит для: длинных промо природы/города, полных музыкальных клипов, эмоциональных короткометражек с длинной аркой персонажа.
