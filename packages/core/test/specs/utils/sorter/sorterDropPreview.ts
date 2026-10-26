import { $ } from '../../../../src/common';
import { DropLocationDeterminer } from '../../../../src/utils/sorter/DropLocationDeterminer';
import { SortableTreeNode } from '../../../../src/utils/sorter/SortableTreeNode';
import { DragDirection, DragSource } from '../../../../src/utils/sorter/types';
import { setupTestEditor } from '../../../common';
import Editor from '../../../../src/editor';

class TestNode extends SortableTreeNode<any> {
  public _element: HTMLElement | undefined;

  constructor(model: any = {}, dragSource: DragSource<any> = {}) {
    super(model, dragSource);
  }

  static create(element?: HTMLElement): TestNode {
    const node = new TestNode({ name: element?.id });
    node._element = element;
    return node;
  }

  get element() {
    return this._element;
  }
  get view() {
    return undefined;
  }
  getChildren() {
    return null;
  }
  getParent() {
    return null;
  }
  addChildAt(node: TestNode) {
    return node;
  }
  removeChildAt() {}
  indexOfChild() {
    return -1;
  }
  canMove() {
    return true;
  }
}

const el = (tag: string, attrs: Record<string, string> = {}, children: HTMLElement[] = []) => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  children.forEach((child) => node.appendChild(child));
  return node;
};

const withModel = (node: HTMLElement) => {
  $(node).data('model', { id: node.id });
  return node;
};

describe('Sorter: drop previews and decorative layers', () => {
  let editor: Editor;

  beforeEach(() => {
    ({ editor } = setupTestEditor({ withCanvas: true }));
    // jsdom has no layout; the tests pick the element under the pointer through
    // `customTarget` instead.
    document.elementFromPoint ??= () => null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    editor.destroy();
  });

  const makeDeterminer = (container: HTMLElement, customTarget?: () => HTMLElement) =>
    new DropLocationDeterminer<any, TestNode>({
      em: editor.getModel(),
      treeClass: TestNode,
      containerContext: { container, itemSel: '*', document, customTarget },
      positionOptions: { canvasRelative: false, relative: false, windowMargin: 0 },
      dragDirection: DragDirection.Vertical,
      eventHandlers: {},
    });

  test('a target inside an aria-hidden layer resolves to the content around it', () => {
    const sparkle = el('span', { id: 'sparkle' });
    const overlay = withModel(el('div', { id: 'overlay', 'aria-hidden': 'true' }, [withModel(sparkle)]));
    const hero = withModel(el('section', { id: 'hero' }, [overlay]));
    const container = el('div', {}, [hero]);
    const determiner = makeDeterminer(container);

    expect((determiner as any).getFirstElementWithAModel(sparkle)).toBe(hero);
    expect((determiner as any).getFirstElementWithAModel(overlay)).toBe(hero);
  });

  test('content outside aria-hidden layers is untouched', () => {
    const title = withModel(el('h1', { id: 'title' }));
    const container = el('div', {}, [withModel(el('section', { id: 'hero' }, [title]))]);
    const determiner = makeDeterminer(container);

    expect((determiner as any).getFirstElementWithAModel(title)).toBe(title);
  });

  test('over the drop preview, the drop stays where it was', () => {
    const inside = el('span');
    const preview = el('div', { 'data-gjs-drop-preview': '' }, [inside]);
    const container = el('div', {}, [withModel(el('section', { id: 'hero' }, [preview]))]);
    document.body.appendChild(container);
    const determiner = makeDeterminer(container, () => inside);
    const target = TestNode.create(container);
    determiner.sourceNodes = [TestNode.create(el('p'))];
    determiner.lastMoveData = { targetNode: target, index: 3, placement: 'before' };
    const getValidParent = jest.spyOn(determiner as any, 'getValidParent');
    const drags: any[] = [];
    editor.on('sorter:drag', (data) => drags.push(data));

    (determiner as any).handleMove(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));

    expect(getValidParent).not.toHaveBeenCalled();
    expect(determiner.lastMoveData.targetNode).toBe(target);
    expect(determiner.lastMoveData.index).toBe(3);
    expect(drags).toHaveLength(1);
    expect(drags[0].targetModel).toBe(target.model);
    expect(drags[0].pos.placement).toBe('before');
    container.remove();
  });

  test('over the drop preview with no drop yet, the target is worked out as usual', () => {
    const inside = el('span');
    const container = el('div', {}, [el('div', { 'data-gjs-drop-preview': '' }, [inside])]);
    const determiner = makeDeterminer(container, () => inside);
    determiner.sourceNodes = [TestNode.create(el('p'))];
    const getFirst = jest.spyOn(determiner as any, 'getFirstElementWithAModel');

    (determiner as any).handleMove(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));

    expect(getFirst).toHaveBeenCalled();
  });
});
