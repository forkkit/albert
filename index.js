import {Equation, Expression, GEQ, Inequality, LEQ, SimplexSolver, StayConstraint, Strength, Variable} from 'cassowary'
import {castArray, omit, uniqueId} from 'lodash-es'

function makeVariable (name, value = undefined) {
  return new Variable({name: uniqueId(name), value})
}

function appendTo (destination, source) {
  for (const x of source) {
    destination.push(x)
  }
}

class Svg {
  constructor (element) {
    this.el_ = element
    this.solver_ = new SimplexSolver()
    this.children_ = []

    const viewBox = element.viewBox.baseVal
    this.leftEdge = makeVariable('leftEdge', viewBox.x)
    this.topEdge = makeVariable('topEdge', viewBox.y)
    this.rightEdge = makeVariable('rightEdge', viewBox.x + viewBox.width)
    this.bottomEdge = makeVariable('bottomEdge', viewBox.y + viewBox.height)
    this.centerX = new Expression(-viewBox.width / 2).plus(this.rightEdge)
    this.centerY = new Expression(-viewBox.height / 2).plus(this.bottomEdge)

    this.solver_.addStay(this.leftEdge, Strength.required)
    this.solver_.addStay(this.topEdge, Strength.required)
    this.solver_.addStay(this.rightEdge, Strength.required)
    this.solver_.addStay(this.bottomEdge, Strength.required)
  }
  append (...children) {
    appendTo(this.children_, children)
    return this
  }
  constrain (...constraints) {
    for (const constraint of constraints) {
      castArray(constraint).forEach((c) => this.solver_.addConstraint(c))
    }
    return this
  }
  render () {
    for (const child of this.children_) {
      this.el_.appendChild(child.render())
    }
    return this
  }
}

class SvgElement {
  constructor (tag, attributes = {}) {
    this.tag_ = tag
    this.attributes_ = omit(attributes, ['x', 'y', 'width', 'height'])
    this.children_ = []

    this.x = makeVariable('x', attributes.x)
    this.y = makeVariable('y', attributes.y)
    this.width = makeVariable('width', attributes.width)
    this.height = makeVariable('height', attributes.height)

    this.leftEdge = new Expression(this.x)
    this.topEdge = new Expression(this.y)
    this.rightEdge = this.leftEdge.plus(this.width)
    this.bottomEdge = this.topEdge.plus(this.height)
    this.centerX = this.leftEdge.plus(new Expression(this.width).divide(2))
    this.centerY = this.topEdge.plus(new Expression(this.height).divide(2))

    // TODO: add more
  }
  append (...children) {
    appendTo(this.children_, children)
    return this
  }
  render () {
    const el = document.createElementNS('http://www.w3.org/2000/svg', this.tag_)
    for (const [name, value] of Object.entries(this.attributes_)) {
      el.setAttributeNS(null, name, value)
    }
    for (const child of this.children_) {
      el.appendChild(child.render())
    }

    el.setAttributeNS(null, 'x', this.x.value)
    el.setAttributeNS(null, 'y', this.y.value)
    el.setAttributeNS(null, 'width', this.width.value)
    el.setAttributeNS(null, 'height', this.height.value)

    return el
  }
}

class SvgText {
  constructor (text, attributes = {}) {
    this.text_ = text
    this.attributes_ = omit(attributes, ['x', 'y', 'fontSize'])

    this.x = makeVariable('x', attributes.x)
    this.y = makeVariable('y', attributes.y)
    this.fontSize = makeVariable('fontSize', attributes['font-size'] || 16)

    this.width = null
    this.height = null
    this.leftEdge = null
    this.topEdge = null
    this.rightEdge = null
    this.bottomEdge = null
    this.centerX = null
    this.centerY = null
    this.baseline = new Expression(this.y)

    this.adjustDimensions_()
  }

  setText (text) {
    this.text_ = text
    this.adjustDimensions_()
  }

  render () {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    for (const [name, value] of Object.entries(this.attributes_)) {
      el.setAttributeNS(null, name, value)
    }
    el.appendChild(document.createTextNode(this.text_))

    el.setAttributeNS(null, 'x', this.x.value)
    el.setAttributeNS(null, 'y', this.y.value)
    el.setAttributeNS(null, 'font-size', this.fontSize.value)

    return el
  }

  withTemporarySvg_(callback) {
    let el = this.render()
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    tempSvg.appendChild(el)
    document.body.appendChild(tempSvg)

    callback.call(this, el)

    document.body.removeChild(tempSvg)
    tempSvg.removeChild(el)
    el = null
  }

  adjustDimensions_() {
    this.withTemporarySvg_((text) => {
      const bbox = text.getBBox()

      const widthRatio = bbox.width / this.fontSize.value
      const heightRatio = bbox.height / this.fontSize.value

      this.width = new Expression(this.fontSize).times(new Expression(widthRatio))
      this.height = new Expression(this.fontSize).times(new Expression(heightRatio))
      this.leftEdge = new Expression(this.x).minus(new Expression(this.x.value - bbox.x))
      this.topEdge = new Expression(this.y).minus(new Expression(this.y.value - bbox.y))
      this.rightEdge = this.leftEdge.plus(this.width)
      this.bottomEdge = this.topEdge.plus(this.height)
      this.centerX = this.leftEdge.plus(this.width.divide(2))
      this.centerY = this.topEdge.plus(this.height.divide(2))
    })
  }
}

class SvgGroup {
  constructor(children = [], attributes = {}) {
    this.children_ = children
    this.attributes_ = omit(attributes)
    this.constraints_ = []

    this.x = makeVariable('x', 0)
    this.y = makeVariable('y', 0)
    this.width = makeVariable('width', 0)
    this.height = makeVariable('height', 0)

    this.leftEdge = new Expression(this.x)
    this.topEdge = new Expression(this.y)
    this.rightEdge = this.leftEdge.plus(this.width)
    this.bottomEdge = this.topEdge.plus(this.height)
    this.centerX = this.leftEdge.plus(new Expression(this.width).divide(2))
    this.centerY = this.topEdge.plus(new Expression(this.height).divide(2))

    this.topMostChild_ = null
    this.bottomMostChild_ = null
    this.leftMostChild_ = null
    this.rightMostChild_ = null
  }

  append (...children) {
    appendTo(this.children_, children)
    return this
  }

  render () {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    for (const [name, value] of Object.entries(this.attributes_)) {
      el.setAttributeNS(null, name, value)
    }
    for (const child of this.children_) {
      el.appendChild(child.render())
    }

    return el
  }

  constraints () {
    const result = this.constraints_.slice()

    if (this.topMostChild_) {
      result.push(new Equation(this.topEdge, this.topMostChild_.topEdge, Strength.medium, 1));
    }
    if (this.bottomMostChild_) {
      result.push(new Equation(this.bottomEdge, this.bottomMostChild_.bottomEdge, Strength.medium, 1));
    }
    if (this.leftMostChild_) {
      result.push(new Equation(this.leftEdge, this.leftMostChild_.leftEdge, Strength.medium, 1));
    }
    if (this.rightMostChild_) {
      result.push(new Equation(this.rightEdge, this.rightMostChild_.rightEdge, Strength.medium, 1));
    }

    for (const child of this.children_) {
      if (child !== this.topMostChild_) {
        result.push(new Inequality(this.topEdge, LEQ, child.topEdge, Strength.weak, 1));
      }
      if (child !== this.bottomMostChild_) {
        result.push(new Inequality(this.bottomEdge, GEQ, child.bottomEdge, Strength.weak, 1));
      }
      if (child !== this.leftMostChild_) {
        result.push(new Inequality(this.leftEdge, LEQ, child.leftEdge, Strength.weak, 1));
      }
      if (child !== this.rightMostChild_) {
        result.push(new Inequality(this.rightEdge, GEQ, child.rightEdge, Strength.weak, 1));
      }
    }
    return result
  }

  fixAll (getter) {
    appendTo(this.constraints_, this.children_.map(
      (child) => new StayConstraint(getter(child), Strength.weak, 1)))
    return this
  }

  alignAll (getter) {
    appendTo(this.constraints_, alignAll(this.children_, getter))
    return this
  }

  distribute (getter) {
    appendTo(this.constraints_, distribute(this.children_, getter))
    return this
  }

  spaceHorizontally (distance = 0) {
    this.leftMostChild_ = this.children_[0]
    this.rightMostChild_ = this.children_[this.children_.length-1]

    appendTo(this.constraints_, spaceHorizontally(this.children_, distance))
    return this
  }

  spaceVertically (distance = 0) {
    this.topMostChild_ = this.children_[0]
    this.bottomMostChild_ = this.children_[this.children_.length-1]

    appendTo(this.constraints_, spaceVertically(this.children_, distance))
    return this
  }
}

function fix (...vars) {
  return vars.map((v) => new StayConstraint(v, Strength.weak, 1))
}

function align (a, b, distance = 0, strength = Strength.weak) {
  const aExpression = (a instanceof Expression) ? a : new Expression(a)

  // a - distance = b => a - b = distance
  const leftSide = aExpression.minus(b)
  return new Equation(leftSide, distance, strength)
}

function fill (a, b, offsetXOrBoth = 0, offsetY = undefined, strength = Strength.weak) {
  if (offsetY === undefined) {
    offsetY = offsetXOrBoth
  }

  return [
    align(a.topEdge, b.topEdge, -offsetY, strength),
    align(a.rightEdge, b.rightEdge, offsetXOrBoth, strength),
    align(a.bottomEdge, b.bottomEdge, offsetY, strength),
    align(a.leftEdge, b.leftEdge, -offsetXOrBoth, strength),
  ]
}

function alignAll(array, getter) {
  const constraints = []
  for (let i = 1; i < array.length; i++) {
    constraints.push(align(getter(array[i-1]), getter(array[i])))
  }
  return constraints
}

function distribute(array, getter) {
  const constraints = []
  const attributes = array.map(getter)

  for (let i = 2; i < attributes.length; i++) {
    const a = attributes[i-2]
    const b = attributes[i-1]
    const c = attributes[i]

    const bExpression = (b instanceof Expression) ? b : new Expression(b)
    const cExpression = (c instanceof Expression) ? c : new Expression(c)

    const leftSide = bExpression.minus(a)
    const rightSide = cExpression.minus(b)

    constraints.push(new Equation(leftSide, rightSide))
  }
  return constraints
}

function spaceHorizontally(array, distance = 0) {
  const constraints = []
  for (let i = 1; i < array.length; i++) {
    constraints.push(align(array[i-1].rightEdge, array[i].leftEdge, -distance))
  }
  return constraints
}

function spaceVertically(array, distance = 0) {
  const constraints = []
  for (let i = 1; i < array.length; i++) {
    constraints.push(align(array[i-1].bottomEdge, array[i].topEdge, -distance))
  }
  return constraints
}

const rootEl = document.getElementById('svg')
rootEl.innerHTML = '' // clear the SVG to make hot reload work better

const svg = new Svg(rootEl)

const rect = new SvgElement('rect', {height: 5, fill: 'blue'})
svg.append(rect)

const column = new SvgElement('rect', {stroke: '#ccc', fill: 'none'})
svg.append(column)

const text = new SvgText('Welcome', {
  'font-size': 40, 'font-family': 'Roboto Mono', 'font-weight': 'bold'})
svg.append(text)

function makeCell(text) {
  return new SvgText(text, {'font-family': 'fantasy', 'font-size': 14})
}

const c1 = new SvgGroup(['one long long', 'two long', 'three'].map(makeCell))
const c2 = new SvgGroup(['longcat is long', 'five', 'six'].map(makeCell))
const c3 = new SvgGroup(['seven', 'eight more', 'over nine thousand'].map(makeCell))
const group = new SvgGroup([c1, c2, c3])
svg.append(group)

const r1 = new SvgElement('rect', {width: 200, height: 30, fill: 'red'})
const r2 = new SvgElement('rect', {width: 300, height: 30, fill: 'lime'})
const r3 = new SvgElement('rect', {width: 200, height: 30, fill: 'blue'})
const rectGroup = new SvgGroup([r1, r2, r3])
svg.append(rectGroup)

svg.constrain(
  fix(text.fontSize, rect.height),

  align(text.topEdge, svg.topEdge, 20),
  align(text.leftEdge, svg.leftEdge, 20),

  align(rect.topEdge, text.baseline, 5),
  align(rect.leftEdge, text.leftEdge),
  align(rect.rightEdge, text.rightEdge),

  align(group.topEdge, rect.bottomEdge, 30),
  align(group.leftEdge, text.leftEdge, 10),
  fill(column, group, 10),
  c1.fixAll((t) => t.fontSize)
    .alignAll((t) => t.leftEdge)
    .spaceVertically(10)
    .constraints(),
  c2.fixAll((t) => t.fontSize)
    .alignAll((t) => t.centerX)
    .spaceVertically(10)
    .constraints(),
  c3.fixAll((t) => t.fontSize)
    .alignAll((t) => t.rightEdge)
    .spaceVertically(10)
    .constraints(),
  group.alignAll((g) => g.topEdge)
    .spaceHorizontally(20)
    .constraints(),

  // TODO: make this automatic for tables
  align(group.topEdge, c1.topEdge),
  align(group.bottomEdge, c1.bottomEdge),

  align(r1.topEdge, column.bottomEdge, 20),
  align(r1.leftEdge, column.leftEdge),
  align(r3.bottomEdge, svg.bottomEdge, -20),
  align(r3.rightEdge, column.rightEdge),

  rectGroup
    .fixAll((r) => r.width)
    .fixAll((r) => r.height)
    .distribute((r) => r.centerX)
    .distribute((r) => r.centerY)
    .constraints(),
)

svg.render()
