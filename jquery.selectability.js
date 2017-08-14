(function (factory) {
  if (typeof define === 'function' && define.amd) {
    define(['jquery'], factory);
  } else {
    factory(jQuery);
  }
})(function ($) {
'use strict';

var KEY_ENTER = 13,
    KEY_SPACE = 32,
    KEY_LEFT = 37,
    KEY_UP = 38,
    KEY_RIGHT = 39,
    KEY_DOWN = 40,
    KEY_ESCAPE = 27;

$.fn.selectability = function() {
  this.each(function() {
    var $this = $(this);

    if (!$this.data('selectability')) {
      $this.data('selectability', new Selectability($this));
    }
  });

  return this;
};

var idgen = (function () {
  var i = 0;
  return function () {
    var id;
    do {
      id = "selectability#id" + (i++);
    } while (document.getElementById(id));

    return id;
  }
})();

function Selectability(element) {
  this.element = element;

  this.buildElements();
  this.stealLabel();
  this.synchronizeAttributes();
  this.populateText();
  this.registerHandlers();

  element
    .attr('tabindex', -1)
    .addClass('selectability-offscreen');
}

Selectability.prototype.buildElements = function () {
  this.textbox = $('<div></div>')
    .attr({
      role: 'textbox',
      tabindex: -1,
      'aria-readonly': 'true'
    });

  this.listbox = $('<div></div>')
    .attr({
      role: 'listbox',
      tabindex: -1,
      'aria-multiselectable': 'false'
    });

  this.combobox = $('<div></div>')
    .addClass('selectability')
    .attr({
      role: 'combobox application',
      tabindex: 0,
      'aria-expanded': 'false'
    });

  this.combobox
    .append(this.textbox)
    .append(this.listbox);

  this.element
    .before(this.combobox);

};

Selectability.prototype.stealLabel = function () {
  var id = this.element.attr('id'),
      label = this.element.attr('aria-label');

  if (label) {
    this.combobox.attr('aria-label', label);
    return;
  }

  if (!id) {
    return;
  }

  var ids = [];
  $('label[for]')
    .filter(function () { return $(this).attr('for') === id })
    .each(function () {
      var $this = $(this),
          autogen = idgen();

      $this.removeAttr('for');
      $this.attr('id', autogen);
      ids.push(autogen);
    });

  this.combobox.attr('aria-labelledby', ids.join(' '));
};

Selectability.prototype.populateText = function (event) {
  if (event && event.selectability) {
    return;
  }

  var selected = this.element.find(':selected');
  if (selected.length) {
    this.textbox.text(selected.attr('label') || selected.text());
  }
}

Selectability.prototype.synchronizeAttributes = function () {
  if (this.element.prop('multiple')) {
    throw new Error('Can only bind to single selection widgets');
  }

  this.disabled = !!this.element.prop('disabled');
  this.combobox.attr({
    'aria-disabled': this.disabled,
    'aria-required': !!this.element.prop('required')
  });
};

Selectability.prototype.registerHandlers = function () {
  this.observeProperties();
  this.registerEvents();
};

Selectability.prototype.observeProperties = function () {
  var synchronize = $.proxy(this.synchronizeAttributes, this),
      observer = window.MutationObserver
              || window.MozMutationObserver
              || window.WebkitMutationObserver;

  if (observer) {
    this.observer = new observer(synchronize);
    this.observer.observe(this.element[0], {
      attributes: true,
      attributeFilter: ['multiple', 'disabled', 'required']
    });
  } else {
    this.element.on({
      'propertychange.selectability': synchronize,
      'focus.selectability': synchronize
    });
  }

  this.element.change($.proxy(this.populateText, this));
};

Selectability.prototype.registerEvents = function () {
  var selectability = this;
  this.combobox.on({
    focusout: function (event) {
      var elt = this;
      setTimeout(function () {
        /*
         * So *after* the focusout event chain has run its course, we look to
         * see what happens with document.activeElement.
         *
         * If whatever got the focus after we were notified doesn't live in the
         * selectability DOM tree, close the combobox.
         *
         * All this, because 'event.relatedTarget' is a DOM3 spec and jQuery
         * only patches it for mouse events.
         *
         * sigh.
         */
        if (!$.contains(elt, document.activeElement)) {
          selectability.closeCombobox();
        }
      }, 0);
    },
    click: $.proxy(this.comboboxClick, this),
    keydown: $.proxy(this.comboboxKeydown, this)
  });

  this.listbox.on({
    click: $.proxy(this.listboxClick, this),
    keydown: $.proxy(this.listboxKeydown, this)
  });
}

Selectability.prototype.comboboxClick = function() {
  if (!this.disabled) {
    this.toggleCombobox();
  }
};

Selectability.prototype.comboboxKeydown = function(event) {
  if (this.disabled) {
    return;
  }

  switch (event.which) {
    case KEY_ENTER:
    case KEY_SPACE:
      if (this.combobox.attr('aria-expanded') === 'true') {
        this.closeCombobox();
        this.combobox.focus();
        event.preventDefault();
        return false;
      }

    case KEY_UP:
    case KEY_DOWN:
    case KEY_LEFT:
    case KEY_RIGHT:
      if (this.combobox.attr('aria-expanded') !== 'true') {
        this.openCombobox();
      }
      this.active.focus();
      event.preventDefault();
      return false;

    case KEY_ESCAPE:
      this.closeCombobox();
      this.combobox.focus();
      event.preventDefault();
      return false;
  }
};

Selectability.prototype.listboxClick = function(event) {
  var $target = $(event.target);
  if ($target.attr('role') !== 'option') {
    return;
  }

  if ($target.attr('aria-disabled') === 'true') {
    return;
  }

  this.setActive($(event.target));
  this.closeCombobox();


  event.preventDefault();
  return false;
};

Selectability.prototype.setActive = function(active) {
  var index = this.listbox.find('[role=option]').index(active),
      value = this.element.find('option').eq(index).val(),
      prev = this.element.val(),
      event = $.Event('change', {
        val: value,
        selectability: true
      });

  // nothing to do
  if (this.element.val() === value) {
    return;
  }

  // some frameworks read element.val() instead of the event value
  // so we populate the value and restore it (see below) if the event is canceled
  this.element.val(value);

  try {
    // work around event handlers throwing exceptions
    this.element.trigger(event);
  } finally {
    // promote 'change' to a cancelable event
    if (!event.isDefaultPrevented()) {
      this.active = active;
      this.textbox.text(active.attr('label') || active.text());
    } else {
      // if the event is prevented, restore the old value
      this.element.val(prev);
    }
  }
};

Selectability.prototype.listboxKeydown = function(event) {
  switch (event.which) {
    case KEY_ENTER:
    case KEY_SPACE:
      this.setActive($(event.target));
      this.closeCombobox();
      this.combobox.focus();

      event.preventDefault();
      return false;

    case KEY_LEFT:
    case KEY_UP:
      event.preventDefault();
      this.moveFocusUp();
      return false;

    case KEY_RIGHT:
    case KEY_DOWN:
      event.preventDefault();
      this.moveFocusDown();
      return false;
  }
};

Selectability.prototype.toggleCombobox = function() {
  if (this.combobox.attr('aria-expanded') === 'true') {
    this.closeCombobox();
  } else {
    this.openCombobox();

    // We may have an empty select widget, so we can't always depend on
    // `active' being defined
    if (this.active) {
      this.active.focus();
    }
  }
};

Selectability.prototype.closeCombobox = function() {
  this.active = null;
  this.listbox.empty();
  this.combobox.attr('aria-expanded', false);
};

Selectability.prototype.openCombobox = function() {
  this.populateListbox();
  this.combobox.attr('aria-expanded', true);
};

Selectability.prototype.populateListbox = function() {
  this.populateText();

  var children = walk.call(this, this.element.children()).children();
  this.listbox.append(children);
  return;

  function walk (elements) {
    var node = $('<div></div>'),
        This = this;

    $.each(elements, function (i, element) {
      var inner = $('<div></div>');
      element = $(element);

      if (element.is('option')) {
        inner
          .text(element.attr('label') || element.text())
          .attr({
            role: 'option',
            tabindex: -1,
            'aria-disabled': !!element.prop('disabled'),
            'aria-selected': element.val() === This.element.val()
          })
          .appendTo(node);

        if (element.prop('disabled')) {
          inner.removeAttr('tabindex');
        } else if (element.val() === This.element.val()) {
          This.active = inner;
        }
      } else if (element.is('optgroup')) {
        var children = walk.call(This, element.children());
        if (children.children().length) {
          var label = $('<div></div>')
            .text(element.attr('label'))
            .attr({
              role: 'heading',
              id: idgen()
            });

          inner
            .attr({
              role: 'group',
              'aria-labelledby': label.attr('id')
            })
            .append(children.prepend(label).children())
            .appendTo(node);
        }
      }
    });

    return node;
  }
};

Selectability.prototype.moveFocusUp = function() {
  var options = this.listbox.find('[role=option]');

  for (var i = options.index(this.active[0]) - 1; i >= 0; i--) {
    var option = $(options[i]);

    if (option.attr('aria-disabled') === 'false') {
      this.active.attr('aria-selected', 'false');

      this.active = option;
      this.active
        .attr('aria-selected', true)
        .focus();
      break;
    }
  }
};

Selectability.prototype.moveFocusDown = function() {
  var options = this.listbox.find('[role=option]');

  for (var i = options.index(this.active[0]) + 1; i < options.length; i++) {
    var option = $(options[i]);

    if (option.attr('aria-disabled') === 'false') {
      this.active.attr({
        'aria-selected': 'false'
      });

      this.active = option;
      this.active
        .attr('aria-selected', true)
        .focus();
      break;
    }
  }
};



});
