import { combine, fromMaybe, lift, map, Maybe } from "@funkia/jabz";
import {
  async, Behavior, changes, filter, Future, keepWhen, performStream,
  sample, snapshot, stepper, Stream, switcher, toggle
} from "@funkia/hareactive";

import { Component, modelView, elements } from "../../../src";
const { div, li, input, label, button, checkbox } = elements;

import { setItemIO, itemBehavior, removeItemIO } from "./localstorage";

const enter = 13;
const esc = 27;
const isKey = (keyCode: number) => (ev: { keyCode: number }) => ev.keyCode === keyCode;

export type Item = {
  taskName: Behavior<string>,
  isComplete: Behavior<boolean>
};

export type PersistedItem = {
  taskName: string,
  isComplete: boolean
};

export type Input = {
  name: string,
  id: number
};

type FromView = {
  toggleTodo: Stream<boolean>,
  taskName: Behavior<string>,
  startEditing: Stream<any>,
  nameBlur: Stream<any>,
  deleteClicked: Stream<number>,
  nameKeyup: Stream<any>,
  newNameInput: Stream<any>
};

type ToView = {
  taskName: Behavior<string>,
  isComplete: Behavior<boolean>,
  newName: Behavior<string>,
  isEditing: Behavior<boolean>,
  focusInput: Stream<any>
};

export type Output = {
  id: number,
  destroyItemId: Stream<number>,
  completed: Behavior<boolean>
};

function* itemModel(
  { toggleTodo, startEditing, nameBlur, deleteClicked, nameKeyup, newNameInput, taskName }: FromView,
  toggleAll: Stream<boolean>, { name: initialName, id }: Input
): any {
  const enterPress = filter(isKey(enter), nameKeyup);
  const enterNotPressed = toggle(true, startEditing, enterPress);
  const cancel = filter(isKey(esc), nameKeyup);
  const notCancelled = toggle(true, startEditing, cancel);
  const stopEditing = combine(enterPress, keepWhen(nameBlur, enterNotPressed), cancel);
  const isEditing = toggle(false, startEditing, stopEditing);
  const newName = stepper(
    initialName,
    combine(newNameInput.map((ev) => ev.target.value), snapshot(taskName, cancel))
  );
  const nameChange = snapshot(newName, keepWhen(stopEditing, notCancelled));

  // Restore potentially persisted todo item
  const persistKey = `todoItem:${id}`;
  const savedItem = yield sample(itemBehavior(persistKey));
  const initial = savedItem === null ? { taskName: initialName, isComplete: false } : savedItem;

  // Initialize task to restored values
  const taskName_ = stepper(initial.taskName, nameChange);
  const isComplete = stepper(initial.isComplete, combine(toggleTodo, toggleAll));

  // Persist todo item
  const item = lift((taskName, isComplete) => ({ taskName, isComplete }), taskName_, isComplete);
  yield performStream(changes(item).map((i: PersistedItem) => setItemIO(persistKey, i)));

  const destroyItem = combine(deleteClicked, nameChange.filter((s) => s === ""));
  const destroyItemId = destroyItem.mapTo(id);

  // Remove persist todo item
  yield performStream(destroyItem.mapTo(removeItemIO(persistKey)));

  return {
    taskName: taskName_, isComplete, isEditing, newName, focusInput:
    startEditing, id, destroyItemId, completed: isComplete
  };
}

function itemView({ taskName, isComplete, isEditing, newName, focusInput }: ToView) {
  return map((out) => ({ taskName, ...out }), li({
    class: "todo",
    classToggle: { completed: isComplete, editing: isEditing }
  }, [
      div({ class: "view" }, [
        checkbox({
          class: "toggle", output: { toggleTodo: "checkedChange" },
          props: { checked: isComplete }
        }),
        label({ output: { startEditing: "dblclick" } }, taskName),
        button({ class: "destroy", output: { deleteClicked: "click" } })
      ]),
      input({
        class: "edit",
        props: { value: taskName },
        output: { newNameInput: "input", nameKeyup: "keyup", nameBlur: "blur" },
        actions: { focus: focusInput }
      })
    ]));
}

export default modelView(itemModel, itemView);
