(function() {
  // If window.HTMLWidgets is already defined, then use it; otherwise create a
  // new object. This allows preceding code to set options that affect the
  // initialization process (though none currently exist).
  window.HTMLWidgets = window.HTMLWidgets || {};

  // See if we're running in a viewer pane. If not, we're in a web browser.
  var viewerMode = window.HTMLWidgets.viewerMode =
      /\bviewer_pane=1\b/.test(window.location);

  // See if we're running in Shiny mode. If not, it's a static document.
  // Note that static widgets can appear in both Shiny and static modes, but
  // obviously, Shiny widgets can only appear in Shiny apps/documents.
  var shinyMode = window.HTMLWidgets.shinyMode =
      typeof(window.Shiny) !== "undefined" && !!window.Shiny.outputBindings;

  // We can't count on jQuery being available, so we implement our own
  // version if necessary.
  function querySelectorAll(scope, selector) {
    if (typeof(jQuery) !== "undefined" && scope instanceof jQuery) {
      return scope.find(selector);
    }
    if (scope.querySelectorAll) {
      return scope.querySelectorAll(selector);
    }
  }

  function asArray(value) {
    if (value === null)
      return [];
    if ($.isArray(value))
      return value;
    return [value];
  }

  // Implement jQuery's extend
  function extend(target /*, ... */) {
    if (arguments.length == 1) {
      return target;
    }
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      for (var prop in source) {
        if (source.hasOwnProperty(prop)) {
          target[prop] = source[prop];
        }
      }
    }
    return target;
  }

  // IE8 doesn't support Array.forEach.
  function forEach(values, callback, thisArg) {
    if (values.forEach) {
      values.forEach(callback, thisArg);
    } else {
      for (var i = 0; i < values.length; i++) {
        callback.call(thisArg, values[i], i, values);
      }
    }
  }

  // Replaces the specified method with the return value of funcSource.
  //
  // Note that funcSource should not BE the new method, it should be a function
  // that RETURNS the new method. funcSource receives a single argument that is
  // the overridden method, it can be called from the new method. The overridden
  // method can be called like a regular function, it has the target permanently
  // bound to it so "this" will work correctly.
  function overrideMethod(target, methodName, funcSource) {
    var superFunc = target[methodName] || function() {};
    var superFuncBound = function() {
      return superFunc.apply(target, arguments);
    };
    target[methodName] = funcSource(superFuncBound);
  }

  // Add a method to delegator that, when invoked, calls
  // delegatee.methodName. If there is no such method on
  // the delegatee, but there was one on delegator before
  // delegateMethod was called, then the original version
  // is invoked instead.
  // For example:
  //
  // var a = {
  //   method1: function() { console.log('a1'); }
  //   method2: function() { console.log('a2'); }
  // };
  // var b = {
  //   method1: function() { console.log('b1'); }
  // };
  // delegateMethod(a, b, "method1");
  // delegateMethod(a, b, "method2");
  // a.method1();
  // a.method2();
  //
  // The output would be "b1", "a2".
  function delegateMethod(delegator, delegatee, methodName) {
    var inherited = delegator[methodName];
    delegator[methodName] = function() {
      var target = delegatee;
      var method = delegatee[methodName];

      // The method doesn't exist on the delegatee. Instead,
      // call the method on the delegator, if it exists.
      if (!method) {
        target = delegator;
        method = inherited;
      }

      if (method) {
        return method.apply(target, arguments);
      }
    };
  }

  // Implement a vague facsimilie of jQuery's data method
  function elementData(el, name, value) {
    if (arguments.length == 2) {
      return el["htmlwidget_data_" + name];
    } else if (arguments.length == 3) {
      el["htmlwidget_data_" + name] = value;
      return el;
    } else {
      throw new Error("Wrong number of arguments for elementData: " +
        arguments.length);
    }
  }

  // http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
  function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  }

  function hasClass(el, className) {
    var re = new RegExp("\\b" + escapeRegExp(className) + "\\b");
    return re.test(el.className);
  }

  // elements - array (or array-like object) of HTML elements
  // className - class name to test for
  // include - if true, only return elements with given className;
  //   if false, only return elements *without* given className
  function filterByClass(elements, className, include) {
    var results = [];
    for (var i = 0; i < elements.length; i++) {
      if (hasClass(elements[i], className) == include)
        results.push(elements[i]);
    }
    return results;
  }

  function on(obj, eventName, func) {
    if (obj.addEventListener) {
      obj.addEventListener(eventName, func, false);
    } else if (obj.attachEvent) {
      obj.attachEvent(eventName, func);
    }
  }

  function off(obj, eventName, func) {
    if (obj.removeEventListener)
      obj.removeEventListener(eventName, func, false);
    else if (obj.detachEvent) {
      obj.detachEvent(eventName, func);
    }
  }

  // Translate array of values to top/right/bottom/left, as usual with
  // the "padding" CSS property
  // https://developer.mozilla.org/en-US/docs/Web/CSS/padding
  function unpackPadding(value) {
    if (typeof(value) === "number")
      value = [value];
    if (value.length === 1) {
      return {top: value[0], right: value[0], bottom: value[0], left: value[0]};
    }
    if (value.length === 2) {
      return {top: value[0], right: value[1], bottom: value[0], left: value[1]};
    }
    if (value.length === 3) {
      return {top: value[0], right: value[1], bottom: value[2], left: value[1]};
    }
    if (value.length === 4) {
      return {top: value[0], right: value[1], bottom: value[2], left: value[3]};
    }
  }

  // Convert an unpacked padding object to a CSS value
  function paddingToCss(paddingObj) {
    return paddingObj.top + "px " + paddingObj.right + "px " + paddingObj.bottom + "px " + paddingObj.left + "px";
  }

  // Makes a number suitable for CSS
  function px(x) {
    if (typeof(x) === "number")
      return x + "px";
    else
      return x;
  }

  // Retrieves runtime widget sizing information for an element.
  // The return value is either null, or an object with fill, padding,
  // defaultWidth, defaultHeight fields.
  function sizingPolicy(el) {
    var sizingEl = document.querySelector("script[data-for='" + el.id + "'][type='application/htmlwidget-sizing']");
    if (!sizingEl)
      return null;
    var sp = JSON.parse(sizingEl.textContent || sizingEl.text || "{}");
    if (viewerMode) {
      return sp.viewer;
    } else {
      return sp.browser;
    }
  }

  // @param tasks Array of strings (or falsy value, in which case no-op).
  //   Each element must be a valid JavaScript expression that yields a
  //   function. Or, can be an array of objects with "code" and "data"
  //   properties; in this case, the "code" property should be a string
  //   of JS that's an expr that yields a function, and "data" should be
  //   an object that will be added as an additional argument when that
  //   function is called.
  // @param target The object that will be "this" for each function
  //   execution.
  // @param args Array of arguments to be passed to the functions. (The
  //   same arguments will be passed to all functions.)
  function evalAndRun(tasks, target, args) {
    if (tasks) {
      forEach(tasks, function(task) {
        var theseArgs = args;
        if (typeof(task) === "object") {
          theseArgs = theseArgs.concat([task.data]);
          task = task.code;
        }
        var taskFunc = tryEval(task);
        if (typeof(taskFunc) !== "function") {
          throw new Error("Task must be a function! Source:\n" + task);
        }
        taskFunc.apply(target, theseArgs);
      });
    }
  }

  // Attempt eval() both with and without enclosing in parentheses.
  // Note that enclosing coerces a function declaration into
  // an expression that eval() can parse
  // (otherwise, a SyntaxError is thrown)
  function tryEval(code) {
    var result = null;
    try {
      result = eval(code);
    } catch(error) {
      if (!error instanceof SyntaxError) {
        throw error;
      }
      try {
        result = eval("(" + code + ")");
      } catch(e) {
        if (e instanceof SyntaxError) {
          throw error;
        } else {
          throw e;
        }
      }
    }
    return result;
  }

  function initSizing(el) {
    var sizing = sizingPolicy(el);
    if (!sizing)
      return;

    var cel = document.getElementById("htmlwidget_container");
    if (!cel)
      return;

    if (typeof(sizing.padding) !== "undefined") {
      document.body.style.margin = "0";
      document.body.style.padding = paddingToCss(unpackPadding(sizing.padding));
    }

    if (sizing.fill) {
      document.body.style.overflow = "hidden";
      document.body.style.width = "100%";
      document.body.style.height = "100%";
      document.documentElement.style.width = "100%";
      document.documentElement.style.height = "100%";
      if (cel) {
        cel.style.position = "absolute";
        var pad = unpackPadding(sizing.padding);
        cel.style.top = pad.top + "px";
        cel.style.right = pad.right + "px";
        cel.style.bottom = pad.bottom + "px";
        cel.style.left = pad.left + "px";
        el.style.width = "100%";
        el.style.height = "100%";
      }

      return {
        getWidth: function() { return cel.offsetWidth; },
        getHeight: function() { return cel.offsetHeight; }
      };

    } else {
      el.style.width = px(sizing.width);
      el.style.height = px(sizing.height);

      return {
        getWidth: function() { return el.offsetWidth; },
        getHeight: function() { return el.offsetHeight; }
      };
    }
  }

  // Default implementations for methods
  var defaults = {
    find: function(scope) {
      return querySelectorAll(scope, "." + this.name);
    },
    renderError: function(el, err) {
      var $el = $(el);

      this.clearError(el);

      // Add all these error classes, as Shiny does
      var errClass = "shiny-output-error";
      if (err.type !== null) {
        // use the classes of the error condition as CSS class names
        errClass = errClass + " " + $.map(asArray(err.type), function(type) {
          return errClass + "-" + type;
        }).join(" ");
      }
      errClass = errClass + " htmlwidgets-error";

      // Is el inline or block? If inline or inline-block, just display:none it
      // and add an inline error.
      var display = $el.css("display");
      $el.data("restore-display-mode", display);

      if (display === "inline" || display === "inline-block") {
        $el.hide();
        if (err.message !== "") {
          var errorSpan = $("<span>").addClass(errClass);
          errorSpan.text(err.message);
          $el.after(errorSpan);
        }
      } else if (display === "block") {
        // If block, add an error just after the el, set visibility:none on the
        // el, and position the error to be on top of the el.
        // Mark it with a unique ID and CSS class so we can remove it later.
        $el.css("visibility", "hidden");
        if (err.message !== "") {
          var errorDiv = $("<div>").addClass(errClass).css("position", "absolute")
            .css("top", el.offsetTop)
            .css("left", el.offsetLeft)
            // setting width can push out the page size, forcing otherwise
            // unnecessary scrollbars to appear and making it impossible for
            // the element to shrink; so use max-width instead
            .css("maxWidth", el.offsetWidth)
            .css("height", el.offsetHeight);
          errorDiv.text(err.message);
          $el.after(errorDiv);

          // Really dumb way to keep the size/position of the error in sync with
          // the parent element as the window is resized or whatever.
          var intId = setInterval(function() {
            if (!errorDiv[0].parentElement) {
              clearInterval(intId);
              return;
            }
            errorDiv
              .css("top", el.offsetTop)
              .css("left", el.offsetLeft)
              .css("maxWidth", el.offsetWidth)
              .css("height", el.offsetHeight);
          }, 500);
        }
      }
    },
    clearError: function(el) {
      var $el = $(el);
      var display = $el.data("restore-display-mode");
      $el.data("restore-display-mode", null);

      if (display === "inline" || display === "inline-block") {
        if (display)
          $el.css("display", display);
        $(el.nextSibling).filter(".htmlwidgets-error").remove();
      } else if (display === "block"){
        $el.css("visibility", "inherit");
        $(el.nextSibling).filter(".htmlwidgets-error").remove();
      }
    },
    sizing: {}
  };

  // Called by widget bindings to register a new type of widget. The definition
  // object can contain the following properties:
  // - name (required) - A string indicating the binding name, which will be
  //   used by default as the CSS classname to look for.
  // - initialize (optional) - A function(el) that will be called once per
  //   widget element; if a value is returned, it will be passed as the third
  //   value to renderValue.
  // - renderValue (required) - A function(el, data, initValue) that will be
  //   called with data. Static contexts will cause this to be called once per
  //   element; Shiny apps will cause this to be called multiple times per
  //   element, as the data changes.
  window.HTMLWidgets.widget = function(definition) {
    if (!definition.name) {
      throw new Error("Widget must have a name");
    }
    if (!definition.type) {
      throw new Error("Widget must have a type");
    }
    // Currently we only support output widgets
    if (definition.type !== "output") {
      throw new Error("Unrecognized widget type '" + definition.type + "'");
    }
    // TODO: Verify that .name is a valid CSS classname

    // Support new-style instance-bound definitions. Old-style class-bound
    // definitions have one widget "object" per widget per type/class of
    // widget; the renderValue and resize methods on such widget objects
    // take el and instance arguments, because the widget object can't
    // store them. New-style instance-bound definitions have one widget
    // object per widget instance; the definition that's passed in doesn't
    // provide renderValue or resize methods at all, just the single method
    //   factory(el, width, height)
    // which returns an object that has renderValue(x) and resize(w, h).
    // This enables a far more natural programming style for the widget
    // author, who can store per-instance state using either OO-style
    // instance fields or functional-style closure variables (I guess this
    // is in contrast to what can only be called C-style pseudo-OO which is
    // what we required before).
    if (definition.factory) {
      definition = createLegacyDefinitionAdapter(definition);
    }

    if (!definition.renderValue) {
      throw new Error("Widget must have a renderValue function");
    }

    // For static rendering (non-Shiny), use a simple widget registration
    // scheme. We also use this scheme for Shiny apps/documents that also
    // contain static widgets.
    window.HTMLWidgets.widgets = window.HTMLWidgets.widgets || [];
    // Merge defaults into the definition; don't mutate the original definition.
    var staticBinding = extend({}, defaults, definition);
    overrideMethod(staticBinding, "find", function(superfunc) {
      return function(scope) {
        var results = superfunc(scope);
        // Filter out Shiny outputs, we only want the static kind
        return filterByClass(results, "html-widget-output", false);
      };
    });
    window.HTMLWidgets.widgets.push(staticBinding);

    if (shinyMode) {
      // Shiny is running. Register the definition with an output binding.
      // The definition itself will not be the output binding, instead
      // we will make an output binding object that delegates to the
      // definition. This is because we foolishly used the same method
      // name (renderValue) for htmlwidgets definition and Shiny bindings
      // but they actually have quite different semantics (the Shiny
      // bindings receive data that includes lots of metadata that it
      // strips off before calling htmlwidgets renderValue). We can't
      // just ignore the difference because in some widgets it's helpful
      // to call this.renderValue() from inside of resize(), and if
      // we're not delegating, then that call will go to the Shiny
      // version instead of the htmlwidgets version.

      // Merge defaults with definition, without mutating either.
      var bindingDef = extend({}, defaults, definition);

      // This object will be our actual Shiny binding.
      var shinyBinding = new Shiny.OutputBinding();

      // With a few exceptions, we'll want to simply use the bindingDef's
      // version of methods if they are available, otherwise fall back to
      // Shiny's defaults. NOTE: If Shiny's output bindings gain additional
      // methods in the future, and we want them to be overrideable by
      // HTMLWidget binding definitions, then we'll need to add them to this
      // list.
      delegateMethod(shinyBinding, bindingDef, "getId");
      delegateMethod(shinyBinding, bindingDef, "onValueChange");
      delegateMethod(shinyBinding, bindingDef, "onValueError");
      delegateMethod(shinyBinding, bindingDef, "renderError");
      delegateMethod(shinyBinding, bindingDef, "clearError");
      delegateMethod(shinyBinding, bindingDef, "showProgress");

      // The find, renderValue, and resize are handled differently, because we
      // want to actually decorate the behavior of the bindingDef methods.

      shinyBinding.find = function(scope) {
        var results = bindingDef.find(scope);

        // Only return elements that are Shiny outputs, not static ones
        var dynamicResults = results.filter(".html-widget-output");

        // It's possible that whatever caused Shiny to think there might be
        // new dynamic outputs, also caused there to be new static outputs.
        // Since there might be lots of different htmlwidgets bindings, we
        // schedule execution for later--no need to staticRender multiple
        // times.
        if (results.length !== dynamicResults.length)
          scheduleStaticRender();

        return dynamicResults;
      };

      // Wrap renderValue to handle initialization, which unfortunately isn't
      // supported natively by Shiny at the time of this writing.

      shinyBinding.renderValue = function(el, data) {
        Shiny.renderDependencies(data.deps);
        // Resolve strings marked as javascript literals to objects
        if (!(data.evals instanceof Array)) data.evals = [data.evals];
        for (var i = 0; data.evals && i < data.evals.length; i++) {
          window.HTMLWidgets.evaluateStringMember(data.x, data.evals[i]);
        }
        if (!bindingDef.renderOnNullValue) {
          if (data.x === null) {
            el.style.visibility = "hidden";
            return;
          } else {
            el.style.visibility = "inherit";
          }
        }
        if (!elementData(el, "initialized")) {
          initSizing(el);

          elementData(el, "initialized", true);
          if (bindingDef.initialize) {
            var result = bindingDef.initialize(el, el.offsetWidth,
              el.offsetHeight);
            elementData(el, "init_result", result);
          }
        }
        bindingDef.renderValue(el, data.x, elementData(el, "init_result"));
        evalAndRun(data.jsHooks.render, elementData(el, "init_result"), [el, data.x]);
      };

      // Only override resize if bindingDef implements it
      if (bindingDef.resize) {
        shinyBinding.resize = function(el, width, height) {
          // Shiny can call resize before initialize/renderValue have been
          // called, which doesn't make sense for widgets.
          if (elementData(el, "initialized")) {
            bindingDef.resize(el, width, height, elementData(el, "init_result"));
          }
        };
      }

      Shiny.outputBindings.register(shinyBinding, bindingDef.name);
    }
  };

  var scheduleStaticRenderTimerId = null;
  function scheduleStaticRender() {
    if (!scheduleStaticRenderTimerId) {
      scheduleStaticRenderTimerId = setTimeout(function() {
        scheduleStaticRenderTimerId = null;
        window.HTMLWidgets.staticRender();
      }, 1);
    }
  }

  // Render static widgets after the document finishes loading
  // Statically render all elements that are of this widget's class
  window.HTMLWidgets.staticRender = function() {
    var bindings = window.HTMLWidgets.widgets || [];
    forEach(bindings, function(binding) {
      var matches = binding.find(document.documentElement);
      forEach(matches, function(el) {
        var sizeObj = initSizing(el, binding);

        if (hasClass(el, "html-widget-static-bound"))
          return;
        el.className = el.className + " html-widget-static-bound";

        var initResult;
        if (binding.initialize) {
          initResult = binding.initialize(el,
            sizeObj ? sizeObj.getWidth() : el.offsetWidth,
            sizeObj ? sizeObj.getHeight() : el.offsetHeight
          );
          elementData(el, "init_result", initResult);
        }

        if (binding.resize) {
          var lastSize = {
            w: sizeObj ? sizeObj.getWidth() : el.offsetWidth,
            h: sizeObj ? sizeObj.getHeight() : el.offsetHeight
          };
          var resizeHandler = function(e) {
            var size = {
              w: sizeObj ? sizeObj.getWidth() : el.offsetWidth,
              h: sizeObj ? sizeObj.getHeight() : el.offsetHeight
            };
            if (size.w === 0 && size.h === 0)
              return;
            if (size.w === lastSize.w && size.h === lastSize.h)
              return;
            lastSize = size;
            binding.resize(el, size.w, size.h, initResult);
          };

          on(window, "resize", resizeHandler);

          // This is needed for cases where we're running in a Shiny
          // app, but the widget itself is not a Shiny output, but
          // rather a simple static widget. One example of this is
          // an rmarkdown document that has runtime:shiny and widget
          // that isn't in a render function. Shiny only knows to
          // call resize handlers for Shiny outputs, not for static
          // widgets, so we do it ourselves.
          if (window.jQuery) {
            window.jQuery(document).on(
              "shown.htmlwidgets shown.bs.tab.htmlwidgets shown.bs.collapse.htmlwidgets",
              resizeHandler
            );
            window.jQuery(document).on(
              "hidden.htmlwidgets hidden.bs.tab.htmlwidgets hidden.bs.collapse.htmlwidgets",
              resizeHandler
            );
          }

          // This is needed for the specific case of ioslides, which
          // flips slides between display:none and display:block.
          // Ideally we would not have to have ioslide-specific code
          // here, but rather have ioslides raise a generic event,
          // but the rmarkdown package just went to CRAN so the
          // window to getting that fixed may be long.
          if (window.addEventListener) {
            // It's OK to limit this to window.addEventListener
            // browsers because ioslides itself only supports
            // such browsers.
            on(document, "slideenter", resizeHandler);
            on(document, "slideleave", resizeHandler);
          }
        }

        var scriptData = document.querySelector("script[data-for='" + el.id + "'][type='application/json']");
        if (scriptData) {
          var data = JSON.parse(scriptData.textContent || scriptData.text);
          // Resolve strings marked as javascript literals to objects
          if (!(data.evals instanceof Array)) data.evals = [data.evals];
          for (var k = 0; data.evals && k < data.evals.length; k++) {
            window.HTMLWidgets.evaluateStringMember(data.x, data.evals[k]);
          }
          binding.renderValue(el, data.x, initResult);
          evalAndRun(data.jsHooks.render, initResult, [el, data.x]);
        }
      });
    });

    invokePostRenderHandlers();
  }


  function has_jQuery3() {
    if (!window.jQuery) {
      return false;
    }
    var $version = window.jQuery.fn.jquery;
    var $major_version = parseInt($version.split(".")[0]);
    return $major_version >= 3;
  }

  /*
  / Shiny 1.4 bumped jQuery from 1.x to 3.x which means jQuery's
  / on-ready handler (i.e., $(fn)) is now asyncronous (i.e., it now
  / really means $(setTimeout(fn)).
  / https://jquery.com/upgrade-guide/3.0/#breaking-change-document-ready-handlers-are-now-asynchronous
  /
  / Since Shiny uses $() to schedule initShiny, shiny>=1.4 calls initShiny
  / one tick later than it did before, which means staticRender() is
  / called renderValue() earlier than (advanced) widget authors might be expecting.
  / https://github.com/rstudio/shiny/issues/2630
  /
  / For a concrete example, leaflet has some methods (e.g., updateBounds)
  / which reference Shiny methods registered in initShiny (e.g., setInputValue).
  / Since leaflet is privy to this life-cycle, it knows to use setTimeout() to
  / delay execution of those methods (until Shiny methods are ready)
  / https://github.com/rstudio/leaflet/blob/18ec981/javascript/src/index.js#L266-L268
  /
  / Ideally widget authors wouldn't need to use this setTimeout() hack that
  / leaflet uses to call Shiny methods on a staticRender(). In the long run,
  / the logic initShiny should be broken up so that method registration happens
  / right away, but binding happens later.
  */
  function maybeStaticRenderLater() {
    if (shinyMode && has_jQuery3()) {
      window.jQuery(window.HTMLWidgets.staticRender);
    } else {
      window.HTMLWidgets.staticRender();
    }
  }

  if (document.addEventListener) {
    document.addEventListener("DOMContentLoaded", function() {
      document.removeEventListener("DOMContentLoaded", arguments.callee, false);
      maybeStaticRenderLater();
    }, false);
  } else if (document.attachEvent) {
    document.attachEvent("onreadystatechange", function() {
      if (document.readyState === "complete") {
        document.detachEvent("onreadystatechange", arguments.callee);
        maybeStaticRenderLater();
      }
    });
  }


  window.HTMLWidgets.getAttachmentUrl = function(depname, key) {
    // If no key, default to the first item
    if (typeof(key) === "undefined")
      key = 1;

    var link = document.getElementById(depname + "-" + key + "-attachment");
    if (!link) {
      throw new Error("Attachment " + depname + "/" + key + " not found in document");
    }
    return link.getAttribute("href");
  };

  window.HTMLWidgets.dataframeToD3 = function(df) {
    var names = [];
    var length;
    for (var name in df) {
        if (df.hasOwnProperty(name))
            names.push(name);
        if (typeof(df[name]) !== "object" || typeof(df[name].length) === "undefined") {
            throw new Error("All fields must be arrays");
        } else if (typeof(length) !== "undefined" && length !== df[name].length) {
            throw new Error("All fields must be arrays of the same length");
        }
        length = df[name].length;
    }
    var results = [];
    var item;
    for (var row = 0; row < length; row++) {
        item = {};
        for (var col = 0; col < names.length; col++) {
            item[names[col]] = df[names[col]][row];
        }
        results.push(item);
    }
    return results;
  };

  window.HTMLWidgets.transposeArray2D = function(array) {
      if (array.length === 0) return array;
      var newArray = array[0].map(function(col, i) {
          return array.map(function(row) {
              return row[i]
          })
      });
      return newArray;
  };
  // Split value at splitChar, but allow splitChar to be escaped
  // using escapeChar. Any other characters escaped by escapeChar
  // will be included as usual (including escapeChar itself).
  function splitWithEscape(value, splitChar, escapeChar) {
    var results = [];
    var escapeMode = false;
    var currentResult = "";
    for (var pos = 0; pos < value.length; pos++) {
      if (!escapeMode) {
        if (value[pos] === splitChar) {
          results.push(currentResult);
          currentResult = "";
        } else if (value[pos] === escapeChar) {
          escapeMode = true;
        } else {
          currentResult += value[pos];
        }
      } else {
        currentResult += value[pos];
        escapeMode = false;
      }
    }
    if (currentResult !== "") {
      results.push(currentResult);
    }
    return results;
  }
  // Function authored by Yihui/JJ Allaire
  window.HTMLWidgets.evaluateStringMember = function(o, member) {
    var parts = splitWithEscape(member, '.', '\\');
    for (var i = 0, l = parts.length; i < l; i++) {
      var part = parts[i];
      // part may be a character or 'numeric' member name
      if (o !== null && typeof o === "object" && part in o) {
        if (i == (l - 1)) { // if we are at the end of the line then evalulate
          if (typeof o[part] === "string")
            o[part] = tryEval(o[part]);
        } else { // otherwise continue to next embedded object
          o = o[part];
        }
      }
    }
  };

  // Retrieve the HTMLWidget instance (i.e. the return value of an
  // HTMLWidget binding's initialize() or factory() function)
  // associated with an element, or null if none.
  window.HTMLWidgets.getInstance = function(el) {
    return elementData(el, "init_result");
  };

  // Finds the first element in the scope that matches the selector,
  // and returns the HTMLWidget instance (i.e. the return value of
  // an HTMLWidget binding's initialize() or factory() function)
  // associated with that element, if any. If no element matches the
  // selector, or the first matching element has no HTMLWidget
  // instance associated with it, then null is returned.
  //
  // The scope argument is optional, and defaults to window.document.
  window.HTMLWidgets.find = function(scope, selector) {
    if (arguments.length == 1) {
      selector = scope;
      scope = document;
    }

    var el = scope.querySelector(selector);
    if (el === null) {
      return null;
    } else {
      return window.HTMLWidgets.getInstance(el);
    }
  };

  // Finds all elements in the scope that match the selector, and
  // returns the HTMLWidget instances (i.e. the return values of
  // an HTMLWidget binding's initialize() or factory() function)
  // associated with the elements, in an array. If elements that
  // match the selector don't have an associated HTMLWidget
  // instance, the returned array will contain nulls.
  //
  // The scope argument is optional, and defaults to window.document.
  window.HTMLWidgets.findAll = function(scope, selector) {
    if (arguments.length == 1) {
      selector = scope;
      scope = document;
    }

    var nodes = scope.querySelectorAll(selector);
    var results = [];
    for (var i = 0; i < nodes.length; i++) {
      results.push(window.HTMLWidgets.getInstance(nodes[i]));
    }
    return results;
  };

  var postRenderHandlers = [];
  function invokePostRenderHandlers() {
    while (postRenderHandlers.length) {
      var handler = postRenderHandlers.shift();
      if (handler) {
        handler();
      }
    }
  }

  // Register the given callback function to be invoked after the
  // next time static widgets are rendered.
  window.HTMLWidgets.addPostRenderHandler = function(callback) {
    postRenderHandlers.push(callback);
  };

  // Takes a new-style instance-bound definition, and returns an
  // old-style class-bound definition. This saves us from having
  // to rewrite all the logic in this file to accomodate both
  // types of definitions.
  function createLegacyDefinitionAdapter(defn) {
    var result = {
      name: defn.name,
      type: defn.type,
      initialize: function(el, width, height) {
        return defn.factory(el, width, height);
      },
      renderValue: function(el, x, instance) {
        return instance.renderValue(x);
      },
      resize: function(el, width, height, instance) {
        return instance.resize(width, height);
      }
    };

    if (defn.find)
      result.find = defn.find;
    if (defn.renderError)
      result.renderError = defn.renderError;
    if (defn.clearError)
      result.clearError = defn.clearError;

    return result;
  }
})();

(function(b,a){if(typeof exports==="object"&&typeof module!=="undefined"){a(exports)}else{if(typeof define==="function"&&define.amd){define(["exports"],a)}else{(a((b.CanvasXpress=b.CanvasXpress||{})))}}}(this,(function(b){var c,a;if(this){c=this.window;a=this.document}CanvasXpress=function(h,f,e,l,d,i,g,k,j){this.init(h,f,e,l,d,i,g,k,j)}})));CanvasXpress.instances=[];CanvasXpress.config=[];CanvasXpress.transitions={};CanvasXpress.cacheImages={};CanvasXpress.cacheImagesReady=false;CanvasXpress.cachePatterns={};CanvasXpress.cacheText={};CanvasXpress.fonts=false;CanvasXpress.vocabulary={};CanvasXpress.stack={};CanvasXpress.current=false;CanvasXpress.resizing=false;CanvasXpress.geo=false;CanvasXpress.leaflet=0;CanvasXpress.system={};CanvasXpress.ready=false;CanvasXpress.factory={version:27.6,buildDate:"03-13-2020",client:"",siteSrc:false,valid:null,href:window.location.href};CanvasXpress.factory.services="https://www.canvasxpress.org/cgi-bin/services.pl";CanvasXpress.onReady=function(){var f=[];var a=false;var d=false;var c=function(){if(!a){console.log("canvasXpress JS ready");a=true;for(var g=0;g<f.length;g++){f[g].fn.call(window,f[g].ctx)}f=[];CanvasXpress.system.isShiny=window.Shiny?true:false;CanvasXpress.system.isjQuery=typeof $==="function";CanvasXpress.system.isReveal=typeof Reveal!="undefined";CanvasXpress.system.isZoom=typeof zoom!="undefined"}};var b=function(){if(window.document.readyState==="complete"){c()}};var e=function(){c()};window.onReady=function(h,g){if(a){setTimeout(function(){h(g)},1);return}else{f.push({fn:h,ctx:g})}if(window.document.readyState==="complete"){setTimeout(c,1)}else{if(!d){if(window.document.addEventListener){window.document.addEventListener("DOMContentLoaded",c,false);window.addEventListener("load",e,false)}else{window.document.attachEvent("onreadystatechange",b);window.attachEvent("onload",e)}d=true}}};return true}();CanvasXpress.loadScripts=function(){var i=0;return function(files,callback,scope){var head=window.document.getElementsByTagName("head")[0];var loadScript=function(s,c){var t=s.type;if(t.match(/javascript/i)){s.onreadystatechange=function(){if(s.readyState==="loaded"||s.readyState==="complete"){s.onreadystatechange=null;c()}};s.onload=function(){c()};head.appendChild(s)}else{head.appendChild(s);c()}};var count=function(){if(i===files.length){i=0;if(callback){if(typeof(callback)=="function"){callback.call(scope)}else{if(typeof(callback)=="string"){eval("var fn = "+callback);fn()}}}}else{CanvasXpress.loadScripts(files,callback,scope)}};i++;loadScript(files[i-1],count)}}();CanvasXpress.transferDatasetAttributes=function(e,a,f){var d=JSON.parse(JSON.stringify(e.dataset));for(var c in d){if(d.hasOwnProperty(c)){if(f){a[c.replace(/^data-/,"")]=d[c]}else{var b="data-"+c.replace(/([a-zA-Z])(?=[A-Z])/g,"$1-").toLowerCase();a.setAttribute(b,d[c])}}}};CanvasXpress.initCanvas=function(){var e=window.document.getElementsByTagName("canvas");for(var d=0;d<e.length;d++){var g=e[d];if(g.className=="CanvasXpress"&&g.id){var f=false;var a={};var b=CanvasXpress.getObject(g.id);if(g.hasAttribute("data-src")&&!b){f=g.getAttribute("data-src");CanvasXpress.transferDatasetAttributes(g,a,true);if(Object.keys(a).length){new CanvasXpress(g.id,f,a)}else{new CanvasXpress(g.id,f)}}}}};CanvasXpress.initImage=function(){var a=window.document.getElementsByTagName("img");for(var c=0;c<a.length;c++){var g=a[c];if(g.className=="CanvasXpress"&&g.id){var f=CanvasXpress.getObject(g.id);var d=g.parentNode;if(!f){var e=g.src;var h=g.id;var b=window.document.createElement("canvas");b.width=g.clientWidth;b.height=g.clientHeight;CanvasXpress.transferDatasetAttributes(g,b);d.removeChild(g);b.id=h;d.appendChild(b);new CanvasXpress(h,e)}}}};CanvasXpress.initTable=function(){var c=window.document.getElementsByTagName("table");for(var b=0;b<c.length;b++){var e=c[b];if(e.className=="CanvasXpress"&&e.id){var g=CanvasXpress.getObject(e.id);var d=e.parentNode;if(!g){var f=e.id;var a=window.document.createElement("canvas");a.id="temp-table-id-"+e.id;a.width=e.hasAttribute("data-width")?e.getAttribute("data-width"):500;a.height=e.hasAttribute("data-height")?e.getAttribute("data-height"):500;CanvasXpress.transferDatasetAttributes(e,a);d.appendChild(a);new CanvasXpress({data:f,renderTo:f})}}}};CanvasXpress.getObject=function(f,b){if(f){for(var a=0;a<CanvasXpress.instances.length;a++){if(CanvasXpress.instances[a].target==f){return CanvasXpress.instances[a]}}}else{if(b){var d=window.document.getElementById(f);if(!d){var e=window.document.createElement("canvas");e.id=f;e.width=100;e.height=100;window.document.body.appendChild(e);d=new CanvasXpress({renderTo:f,hidden:true})}return d}else{if(CanvasXpress.instances.length){return CanvasXpress.instances[0]}}}};CanvasXpress.$=function(b,a){return CanvasXpress.getObject(b,a)};CanvasXpress.destroy=function(a){if(CanvasXpress.instances.length>0){CanvasXpress.instances[0].destroy(a)}};CanvasXpress.prototype.init=function(e,c,b,i,a,f,d,h,g){if(!e){return}else{if(typeof(e)=="object"&&e.renderTo){c=e.data||false;b=e.config||false;if(e.version){b.createVersion=e.version}if(e.factory){b.createFactory=e.factory}if(e.geo){b.createGeo=e.geo}i=e.events||false;a=e.info||false;f=e.afterRender||false;d=e.hidden||false;h=e.callback||false;g=e.uploadFile||false;e=e.renderTo}}this.setInit=function(){this.target=e;this.events=i;this.info=a;this.userId=1;this.registered=false;this.url={};this.meta={ids:{},time:{start:new Date().getTime(),elapsed:null,end:null,draw:[],render:[]},data:false,canvas:{},config:{user:b,orig:{},vals:{},remote:false},vals:{},render:{objects:[],groups:{},types:{},order:[],map:{},origin:[],transition:false},events:{},state:{save:0,clip:false,translate:[0,0],rotate:[0],scale:[1,1],last:{translate:[0,0],rotate:[0],scale:[1,1]}},stack:[],def:{}}};this.validateParameters=function(){this.validateData();this.validateConfig();this.validateEvents();this.validateInfo();this.validateAfterRender()};this.validateData=function(){this.dataURL=false;this.dataString=false;if(typeof(c)=="string"){var l=window.document.getElementById(c);if(l&&l.tagName.toLowerCase()=="table"&&l.className=="CanvasXpress"&&l.id){var m=c;c=this.parseHTMLTable(l,true);b=c.config;c=c.data;l.parentNode.removeChild(l);var j=window.document.getElementById("temp-table-id-"+m);if(j){j.id=m}else{alert("Dude! What did you do?")}}else{var l=this.isValidString(c);switch(l.type){case"URL":this.dataURL=c;c=false;break;case"XML":this.dataString=l.data;c=false;break;case"JSON":c=l.data;break;case"DELIM":c=l.data.data;if(!b){b:l.data.config}break;default:alert("Not a valid data string\n");break}}}else{try{this.stringifyJSON(c)}catch(k){alert("Data object malformed:\n"+k)}}};this.validateConfig=function(){if(b){try{this.stringifyJSON(b)}catch(j){alert("Config object malformed:\n"+j)}}};this.validateEvents=function(){};this.validateInfo=function(){if(!a){a=""}};this.validateAfterRender=function(){if(f){try{this.stringifyJSON(f)}catch(j){alert("AfterRender object malformed:\n"+j)}}};this.isOneTimeFunctionInConfig=function(j){if(!j){j=this}if(j.transposeData){return true}if(j.asSampleFactors&&j.asSampleFactors.length){return true}if(j.asVariableFactors&&j.asVariableFactors.length){return true}if(j.stringSampleFactors&&j.stringSampleFactors.length){return true}if(j.stringVariableFactors&&j.stringVariableFactors.length){return true}if(j.asHistogram){return true}if(j.sortData&&j.sortData.length){return true}return false};this.afterRender=function(s){if(!s){s=[]}var u=this.meta.time.start;if(this.graphType!="Map"){if(this.asHistogram){if(this.asHistogram===true){s.unshift(["createHistogram",[],{},u])}else{s.unshift(["createHistogram",[this.asHistogram],{},u])}this.asHistogram=false}if(this.stringVariableFactors.length){for(var m=0;m<this.stringVariableFactors.length;m++){s.unshift(["switchNumericToString",[this.stringVariableFactors[m]],{},u])}this.stringVariableFactors=[];this.layoutRestore=false}if(this.stringSampleFactors.length){for(var m=0;m<this.stringSampleFactors.length;m++){s.unshift(["switchNumericToString",[this.stringSampleFactors[m],true],{},u])}this.stringSampleFactors=[];this.layoutRestore=false}if(this.asVariableFactors.length){for(var m=0;m<this.asVariableFactors.length;m++){s.unshift(["switchVarToAnnotation",[this.asVariableFactors[m]],{},u])}this.asVariableFactors=[];this.layoutRestore=false}if(this.asSampleFactors.length){for(var m=0;m<this.asSampleFactors.length;m++){s.unshift(["switchSmpToAnnotation",[this.asSampleFactors[m]],{},u])}this.asSampleFactors=[];this.layoutRestore=false}if(this.transposeData){s.unshift(["transpose",[false,true],{},u]);this.transposeData=false}if(this.sortData){for(var m=0;m<this.sortData.length;m++){s.push(["modifySort",[this.sortData[m][0],this.sortData[m][1],this.sortData[m][2]],{},u])}this.sortData=[]}if(this.selectedDataPoints.length){var r=false;for(var m=0;m<this.selectedDataPoints.length;m++){var l=this.getVariableIndices(this.selectedDataPoints[m]);if(l>=0){this.setSelectObject(false,[l,this.xAxisIndices[0],this.yAxisIndices[0],false]);r=true}}this.selectedDataPoints=[];if(r){s.unshift(["broadcastDraw",[],{},u])}}var n=s.length-1;for(var m=0;m<s.length;m++){var k=s[m];var p=k.shift();var j=k.length>0?k.shift():[];var q=k.length>0?k.shift():{};if(this.showFunctionNamesAfterRender){this.flashInfoSpan(20,20,p)}this.skipRender=!this.showTransition&&m<n?true:this.view=="table"?true:false;for(var o in q){this[o]=q[o]}this[p].apply(this,j)}if(this.view=="table"){this.view="canvas";this.clickView()}this.triggerDataLoaded("afterRender")}else{this.deferedAfterRender=s}};this.setURL=function(){if(window.location.search!=""){var l=location.search.substring(1).split("&");for(var k=0;k<l.length;k++){var j=l[k].split("=");if(!j[0]){continue}if(j[0].match(/^cX/)){this.url[j[0]]=j[1]||true}else{this.url[j[0]]=j[1]=="false"?false:j[1]=="true"?true:j[1]}}}};this.createThumbnail=function(){if(this.url.hasOwnProperty("cXprint")||this.printThumbnail){this.printThumbnail=false;var k=this.url.cXprint!==true&&this.url.cXprint!=="true"?this.url.cXprint:this.saveFilename?this.saveFilename:this.target+".png";var j=this;setTimeout(function(){j.print(false,k);setTimeout(function(){window.close()},1000)},1)}};this.setFunctionNames=function(k){var l=function(m){return m&&{}.toString.call(m)==="[object Function]"};for(var j in this){if(this[j]&&!this[j].fname&&l(this[j])){this[j].fname=j;this[j].pname=k||"CanvasXpress"}}};this.setFonts=function(){(function(){if(window.navigator.onLine&&!CanvasXpress.instances[0].offline&&!CanvasXpress.fonts){var k=window.document.createElement("link");k.type="text/css";k.rel="stylesheet";k.href="https://fonts.googleapis.com/css?family=Indie+Flower|Ubuntu|Architects+Daughter|Roboto:400,700,700italic";var j=window.document.getElementsByTagName("head")[0];j.appendChild(k);var l=new Image();l.onerror=function(){var o=window.document.createElement("canvas");var n=o.getContext("2d",{willReadFrequently:true});var m="10px Ubuntu";n.font=m;n.fillText("css loaded",100,100);m="10px Indie Flower";n.font=m;n.fillText("css loaded",100,100);m="10px Architects Daughter";n.font=m;n.fillText("css loaded",100,100);m="10px Roboto";n.font=m;n.fillText("css loaded",100,100)};l.src="https://fonts.googleapis.com/css?family=Indie+Flower|Ubuntu|Architects+Daughter|Roboto:400,700,700italic";CanvasXpress.fonts=true}}())};this.triggerDataLoaded=function(l){var k=this;var j=function(){if(h){h();h=undefined}k.logConsole("canvasXpress data ready - "+l);k.createThumbnail();CanvasXpress.ready=true};if(CanvasXpress.cacheImagesReady){if(l=="afterRender"){if(!this.isAnimation&&!this.isTransitionOn&&!this.dataURL&&!this.dataString&&!g&&!this.isUpdateRemoteData&&!d){j()}}else{if(this.graphType=="Network"){if(!this.isAnimation&&!this.isUpdateRemoteData){j()}}else{if(!this.isTransitionOn){j()}}}}};this.saveFirstState=function(){CanvasXpress.stack[this.target].state.push(this.getConfigState())};this.continueInitialization=function(){var j=CanvasXpress.stack[this.target];this.initGraph(this.isOneTimeFunctionInConfig());this.afterRender(j.afterRenderInit);this.getDataFromURLOrString(this.target,j.config,j.events,j.info);this.saveFirstState();CanvasXpress.current=this.target;this.meta.time.end=new Date().getTime();this.meta.time.elapsed=this.meta.time.end-this.meta.time.start;this.hideMask()};this.pauseInitialization=function(){if(!this.lazyLoad||(!this.loaded&&this.isInViewport(this.meta.canvas.ctx.canvas))){this.continueInitialization()}};this.initialize=function(){if(b&&b.graphType=="Map"&&b.topoJSON&&b.leafletId&&b.leafletLayer){this.initializeL()}else{this.initializeNoL()}};this.initializeNoL=function(){CanvasXpress.instances.push(this);this.setInit();this.setURL();this.initDOM();this.initSVG();this.initInterface();this.initSave();this.validateParameters();this.initConfig(b);this.initDate();this.setFonts();this.initViewport(d);this.initPrimitives();this.initUtils();this.initNumeric();this.initjLouvain();this.initConrec();this.initMathUtils();this.initLegendUtils();this.initFilterUtils();this.initClusterUtils();this.initSortUtils();this.initExample();this.initVocabulary();this.initDataUtils();this.initRandom();this.initData(c);this.initValidity();this.initLayout();this.initEvents();this.initTooltip();this.initToolbar();this.initMenus();this.initLinks();this.initConfigurator();this.initDataFilter();this.initDataTable();this.initCodeInfo();this.initBin();this.initDataExplorer();this.initAnimation();this.initRemote();this.initStack(c,b,i,a,f);this.initTransitions();this.pauseInitialization()};this.initializeL=function(){if(window.L){this.initializeNoL()}else{var m=this;var l=window.navigator.onLine?"https://www.canvasxpress.org/":"http://localhost:8000/";var j=document.createElement("script");j.type="text/javascript";j.src=l+"assets/leaflet/leaflet.js";var k=document.createElement("link");k.type="text/css";k.rel="stylesheet";k.href=l+"assets/leaflet/leaflet.css";var n=setTimeout(function(){m.initializeNoL()},++CanvasXpress.leaflet*50);CanvasXpress.loadScripts([j,k],n,this)}};this.initialize();this.setFunctionNames("init")};CanvasXpress.letters=["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];CanvasXpress.countries={AFG:["Afghanistan","Asia","South Asia"],ALA:["Aland Islands","Europe","North Europe"],ALB:["Albania","Europe","South Europe"],DZA:["Algeria","Africa","North Africa"],ASM:["American Samoa","Oceania","Polynesia"],AND:["Andorra","Europe","South Europe"],AGO:["Angola","Africa","Middle Africa"],AIA:["Anguilla","America","Caribbean"],ATA:["Antarctica","",""],ATG:["Antigua and Barbuda","America","Caribbean"],ARG:["Argentina","America","South America"],ARM:["Armenia","Asia","West Asia"],ABW:["Aruba","America","Caribbean"],AUS:["Australia","Oceania","Australia and New Zealand"],AUT:["Austria","Europe","West Europe"],AZE:["Azerbaijan","Asia","West Asia"],BHS:["Bahamas","America","Caribbean"],BHR:["Bahrain","Asia","West Asia"],BGD:["Bangladesh","Asia","South Asia"],BRB:["Barbados","America","Caribbean"],BLR:["Belarus","Europe","East Europe"],BEL:["Belgium","Europe","West Europe"],BLZ:["Belize","America","Central America"],BEN:["Benin","Africa","West Africa"],BMU:["Bermuda","America","North America"],BTN:["Bhutan","Asia","South Asia"],BOL:["Bolivia","America","South America"],BES:["Bonaire","America","Caribbean"],BIH:["Bosnia and Herzegovina","Europe","South Europe"],BWA:["Botswana","Africa","South Africa"],BVT:["Bouvet Island","",""],BRA:["Brazil","America","South America"],IOT:["British Indian Ocean Territory","",""],BRN:["Brunei Darussalam","Asia","South-East Asia"],BGR:["Bulgaria","Europe","East Europe"],BFA:["Burkina Faso","Africa","West Africa"],BDI:["Burundi","Africa","East Africa"],KHM:["Cambodia","Asia","South-East Asia"],CMR:["Cameroon","Africa","Middle Africa"],CAN:["Canada","America","North America"],CPV:["Cabo Verde","Africa","West Africa"],CYM:["Cayman Islands","America","Caribbean"],CAF:["Central African Republic","Africa","Middle Africa"],TCD:["Chad","Africa","Middle Africa"],CHL:["Chile","America","South America"],CHN:["China","Asia","East Asia"],CXR:["Christmas Island","",""],CCK:["Cocos (Keeling) Islands","",""],COL:["Colombia","America","South America"],COM:["Comoros","Africa","East Africa"],COG:["Congo","Africa","Middle Africa"],COD:["Congo (Democratic Republic of the)","Africa","Middle Africa"],COK:["Cook Islands","Oceania","Polynesia"],CRI:["Costa Rica","America","Central America"],CIV:["Cote d'Ivoire","Africa","West Africa"],HRV:["Croatia","Europe","South Europe"],CUB:["Cuba","America","Caribbean"],CUW:["Curaçao","America","Caribbean"],CYP:["Cyprus","Asia","West Asia"],CZE:["Czech Republic","Europe","East Europe"],DNK:["Denmark","Europe","North Europe"],DJI:["Djibouti","Africa","East Africa"],DMA:["Dominica","America","Caribbean"],DOM:["Dominican Republic","America","Caribbean"],ECU:["Ecuador","America","South America"],EGY:["Egypt","Africa","North Africa"],SLV:["El Salvador","America","Central America"],GNQ:["Equatorial Guinea","Africa","Middle Africa"],ERI:["Eritrea","Africa","East Africa"],EST:["Estonia","Europe","North Europe"],ETH:["Ethiopia","Africa","East Africa"],FLK:["Falkland Islands","America","South America"],FRO:["Faroe Islands","Europe","North Europe"],FJI:["Fiji","Oceania","Melanesia"],FIN:["Finland","Europe","North Europe"],FRA:["France","Europe","West Europe"],GUF:["French Guiana","America","South America"],PYF:["French Polynesia","Oceania","Polynesia"],ATF:["French Southern Territories","",""],GAB:["Gabon","Africa","Middle Africa"],GMB:["Gambia","Africa","West Africa"],GEO:["Georgia","Asia","West Asia"],DEU:["Germany","Europe","West Europe"],GHA:["Ghana","Africa","West Africa"],GIB:["Gibraltar","Europe","South Europe"],GRC:["Greece","Europe","South Europe"],GRL:["Greenland","America","North America"],GRD:["Grenada","America","Caribbean"],GLP:["Guadeloupe","America","Caribbean"],GUM:["Guam","Oceania","Micronesia"],GTM:["Guatemala","America","Central America"],GGY:["Guernsey","Europe","North Europe"],GIN:["Guinea","Africa","West Africa"],GNB:["Guinea-Bissau","Africa","West Africa"],GUY:["Guyana","America","South America"],HTI:["Haiti","America","Caribbean"],HMD:["Heard Island and McDonald Islands","",""],VAT:["Holy See","Europe","South Europe"],HND:["Honduras","America","Central America"],HKG:["Hong Kong","Asia","East Asia"],HUN:["Hungary","Europe","East Europe"],ISL:["Iceland","Europe","North Europe"],IND:["India","Asia","South Asia"],IDN:["Indonesia","Asia","South-East Asia"],IRN:["Iran","Asia","South Asia"],IRQ:["Iraq","Asia","West Asia"],IRL:["Ireland","Europe","North Europe"],IMN:["Isle of Man","Europe","North Europe"],ISR:["Israel","Asia","West Asia"],ITA:["Italy","Europe","South Europe"],JAM:["Jamaica","America","Caribbean"],JPN:["Japan","Asia","East Asia"],JEY:["Jersey","Europe","North Europe"],JOR:["Jordan","Asia","West Asia"],KAZ:["Kazakhstan","Asia","Central Asia"],KEN:["Kenya","Africa","East Africa"],KIR:["Kiribati","Oceania","Micronesia"],PRK:["Korea (Democratic People's Republic of)","Asia","East Asia"],KOR:["Korea (Republic of)","Asia","East Asia"],KWT:["Kuwait","Asia","West Asia"],KGZ:["Kyrgyzstan","Asia","Central Asia"],LAO:["Lao People's Democratic Republic","Asia","South-East Asia"],LVA:["Latvia","Europe","North Europe"],LBN:["Lebanon","Asia","West Asia"],LSO:["Lesotho","Africa","South Africa"],LBR:["Liberia","Africa","West Africa"],LBY:["Libya","Africa","North Africa"],LIE:["Liechtenstein","Europe","West Europe"],LTU:["Lithuania","Europe","North Europe"],LUX:["Luxembourg","Europe","West Europe"],MAC:["Macao","Asia","East Asia"],MKD:["Macedonia","Europe","South Europe"],MDG:["Madagascar","Africa","East Africa"],MWI:["Malawi","Africa","East Africa"],MYS:["Malaysia","Asia","South-East Asia"],MDV:["Maldives","Asia","South Asia"],MLI:["Mali","Africa","West Africa"],MLT:["Malta","Europe","South Europe"],MHL:["Marshall Islands","Oceania","Micronesia"],MTQ:["Martinique","America","Caribbean"],MRT:["Mauritania","Africa","West Africa"],MUS:["Mauritius","Africa","East Africa"],MYT:["Mayotte","Africa","East Africa"],MEX:["Mexico","America","Central America"],FSM:["Micronesia","Oceania","Micronesia"],MDA:["Moldova","Europe","East Europe"],MCO:["Monaco","Europe","West Europe"],MNG:["Mongolia","Asia","East Asia"],MNE:["Montenegro","Europe","South Europe"],MSR:["Montserrat","America","Caribbean"],MAR:["Morocco","Africa","North Africa"],MOZ:["Mozambique","Africa","East Africa"],MMR:["Myanmar","Asia","South-East Asia"],NAM:["Namibia","Africa","South Africa"],NRU:["Nauru","Oceania","Micronesia"],NPL:["Nepal","Asia","South Asia"],NLD:["Netherlands","Europe","West Europe"],NCL:["New Caledonia","Oceania","Melanesia"],NZL:["New Zealand","Oceania","Australia and New Zealand"],NIC:["Nicaragua","America","Central America"],NER:["Niger","Africa","West Africa"],NGA:["Nigeria","Africa","West Africa"],NIU:["Niue","Oceania","Polynesia"],NFK:["Norfolk Island","Oceania","Australia and New Zealand"],MNP:["West Mariana Islands","Oceania","Micronesia"],NOR:["Norway","Europe","North Europe"],OMN:["Oman","Asia","West Asia"],PAK:["Pakistan","Asia","South Asia"],PLW:["Palau","Oceania","Micronesia"],PSE:["Palestine","Asia","West Asia"],PAN:["Panama","America","Central America"],PNG:["Papua New Guinea","Oceania","Melanesia"],PRY:["Paraguay","America","South America"],PER:["Peru","America","South America"],PHL:["Philippines","Asia","South-East Asia"],PCN:["Pitcairn","Oceania","Polynesia"],POL:["Poland","Europe","East Europe"],PRT:["Portugal","Europe","South Europe"],PRI:["Puerto Rico","America","Caribbean"],QAT:["Qatar","Asia","West Asia"],REU:["Réunion","Africa","East Africa"],ROU:["Romania","Europe","East Europe"],RUS:["Russian Federation","Europe","East Europe"],RWA:["Rwanda","Africa","East Africa"],BLM:["Saint Barthelemy","America","Caribbean"],SHN:["Saint Helena","Africa","West Africa"],KNA:["Saint Kitts and Nevis","America","Caribbean"],LCA:["Saint Lucia","America","Caribbean"],MAF:["Saint Martin","America","Caribbean"],SPM:["Saint Pierre and Miquelon","America","North America"],VCT:["Saint Vincent and the Grenadines","America","Caribbean"],WSM:["Samoa","Oceania","Polynesia"],SMR:["San Marino","Europe","South Europe"],STP:["Sao Tome and Principe","Africa","Middle Africa"],SAU:["Saudi Arabia","Asia","West Asia"],SEN:["Senegal","Africa","West Africa"],SRB:["Serbia","Europe","South Europe"],SYC:["Seychelles","Africa","East Africa"],SLE:["Sierra Leone","Africa","West Africa"],SGP:["Singapore","Asia","South-East Asia"],SXM:["Sint Maarten","America","Caribbean"],SVK:["Slovakia","Europe","East Europe"],SVN:["Slovenia","Europe","South Europe"],SLB:["Solomon Islands","Oceania","Melanesia"],SOM:["Somalia","Africa","East Africa"],ZAF:["South Africa","Africa","South Africa"],SGS:["South Georgia and the South Sandwich Islands","",""],SSD:["South Sudan","Africa","East Africa"],ESP:["Spain","Europe","South Europe"],LKA:["Sri Lanka","Asia","South Asia"],SDN:["Sudan","Africa","North Africa"],SUR:["Suriname","America","South America"],SJM:["Svalbard and Jan Mayen","Europe","North Europe"],SWZ:["Swaziland","Africa","South Africa"],SWE:["Sweden","Europe","North Europe"],CHE:["Switzerland","Europe","West Europe"],SYR:["Syrian Arab Republic","Asia","West Asia"],TWN:["Taiwan","Asia","East Asia"],TJK:["Tajikistan","Asia","Central Asia"],TZA:["Tanzania","Africa","East Africa"],THA:["Thailand","Asia","South-East Asia"],TLS:["Timor-Leste","Asia","South-East Asia"],TGO:["Togo","Africa","West Africa"],TKL:["Tokelau","Oceania","Polynesia"],TON:["Tonga","Oceania","Polynesia"],TTO:["Trinidad and Tobago","America","Caribbean"],TUN:["Tunisia","Africa","North Africa"],TUR:["Turkey","Asia","West Asia"],TKM:["Turkmenistan","Asia","Central Asia"],TCA:["Turks and Caicos Islands","America","Caribbean"],TUV:["Tuvalu","Oceania","Polynesia"],UGA:["Uganda","Africa","East Africa"],UKR:["Ukraine","Europe","East Europe"],ARE:["United Arab Emirates","Asia","West Asia"],GBR:["United Kingdom of Great Britain and Northern Ireland","Europe","North Europe"],USA:["United States of America","America","North America"],UMI:["United States Minor Outlying Islands","",""],URY:["Uruguay","America","South America"],UZB:["Uzbekistan","Asia","Central Asia"],VUT:["Vanuatu","Oceania","Melanesia"],VEN:["Venezuela","America","South America"],VNM:["Vietnam","Asia","South-East Asia"],VGB:["Virgin Islands (British)","America","Caribbean"],VIR:["Virgin Islands (U.S.)","America","Caribbean"],WLF:["Wallis and Futuna","Oceania","Polynesia"],ESH:["Western Sahara","Africa","North Africa"],YEM:["Yemen","Asia","West Asia"],ZMB:["Zambia","Africa","East Africa"],ZWE:["Zimbabwe","Africa","East Africa"]};CanvasXpress.chromosomes={hg19:{columns:["start","end","name","stain"],order:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,"X","Y"],data:{1:[[0,2300000,"p36.33","gneg"],[2300000,5300000,"p36.32","gpos25"],[5300000,7100000,"p36.31","gneg"],[7100000,9200000,"p36.23","gpos25"],[9200000,12600000,"p36.22","gneg"],[12600000,16100000,"p36.21","gpos50"],[16100000,20300000,"p36.13","gneg"],[20300000,23800000,"p36.12","gpos25"],[23800000,27800000,"p36.11","gneg"],[27800000,30000000,"p35.3","gpos25"],[30000000,32200000,"p35.2","gneg"],[32200000,34400000,"p35.1","gpos25"],[34400000,39600000,"p34.3","gneg"],[39600000,43900000,"p34.2","gpos25"],[43900000,46500000,"p34.1","gneg"],[46500000,51300000,"p33","gpos75"],[51300000,56200000,"p32.3","gneg"],[56200000,58700000,"p32.2","gpos50"],[58700000,60900000,"p32.1","gneg"],[60900000,68700000,"p31.3","gpos50"],[68700000,69500000,"p31.2","gneg"],[69500000,84700000,"p31.1","gpos100"],[84700000,88100000,"p22.3","gneg"],[88100000,92000000,"p22.2","gpos75"],[92000000,94500000,"p22.1","gneg"],[94500000,99400000,"p21.3","gpos75"],[99400000,102000000,"p21.2","gneg"],[102000000,107000000,"p21.1","gpos100"],[107000000,111600000,"p13.3","gneg"],[111600000,115900000,"p13.2","gpos50"],[115900000,117600000,"p13.1","gneg"],[117600000,120700000,"p12","gpos50"],[120700000,121100000,"p11.2","gneg"],[121100000,124300000,"p11.1","acen"],[124300000,128000000,"q11","acen"],[128000000,142400000,"q12","gvar"],[142400000,148000000,"q21.1","gneg"],[148000000,149600000,"q21.2","gpos50"],[149600000,153300000,"q21.3","gneg"],[153300000,154800000,"q22","gpos50"],[154800000,157300000,"q23.1","gneg"],[157300000,158800000,"q23.2","gpos50"],[158800000,163800000,"q23.3","gneg"],[163800000,165500000,"q24.1","gpos50"],[165500000,169100000,"q24.2","gneg"],[169100000,171200000,"q24.3","gpos75"],[171200000,174300000,"q25.1","gneg"],[174300000,178600000,"q25.2","gpos50"],[178600000,184000000,"q25.3","gneg"],[184000000,189000000,"q31.1","gpos100"],[189000000,192100000,"q31.2","gneg"],[192100000,197500000,"q31.3","gpos100"],[197500000,205300000,"q32.1","gneg"],[205300000,209500000,"q32.2","gpos25"],[209500000,212100000,"q32.3","gneg"],[212100000,222100000,"q41","gpos100"],[222100000,222700000,"q42.11","gneg"],[222700000,225100000,"q42.12","gpos25"],[225100000,228800000,"q42.13","gneg"],[228800000,232700000,"q42.2","gpos50"],[232700000,234600000,"q42.3","gneg"],[234600000,241700000,"q43","gpos75"],[241700000,247249719,"q44","gneg"]],2:[[0,4300000,"p25.3","gneg"],[4300000,7000000,"p25.2","gpos50"],[7000000,12800000,"p25.1","gneg"],[12800000,17000000,"p24.3","gpos75"],[17000000,19100000,"p24.2","gneg"],[19100000,23900000,"p24.1","gpos75"],[23900000,27700000,"p23.3","gneg"],[27700000,29800000,"p23.2","gpos25"],[29800000,31900000,"p23.1","gneg"],[31900000,36400000,"p22.3","gpos75"],[36400000,38400000,"p22.2","gneg"],[38400000,41600000,"p22.1","gpos50"],[41600000,47600000,"p21","gneg"],[47600000,52700000,"p16.3","gpos100"],[52700000,54800000,"p16.2","gneg"],[54800000,61100000,"p16.1","gpos100"],[61100000,64000000,"p15","gneg"],[64000000,70500000,"p14","gpos50"],[70500000,72600000,"p13.3","gneg"],[72600000,73900000,"p13.2","gpos50"],[73900000,75400000,"p13.1","gneg"],[75400000,83700000,"p12","gpos100"],[83700000,91000000,"p11.2","gneg"],[91000000,93300000,"p11.1","acen"],[93300000,95700000,"q11.1","acen"],[95700000,102100000,"q11.2","gneg"],[102100000,105300000,"q12.1","gpos50"],[105300000,106700000,"q12.2","gneg"],[106700000,108600000,"q12.3","gpos25"],[108600000,113800000,"q13","gneg"],[113800000,118600000,"q14.1","gpos50"],[118600000,122100000,"q14.2","gneg"],[122100000,129600000,"q14.3","gpos50"],[129600000,132200000,"q21.1","gneg"],[132200000,134800000,"q21.2","gpos25"],[134800000,136600000,"q21.3","gneg"],[136600000,142400000,"q22.1","gpos100"],[142400000,144700000,"q22.2","gneg"],[144700000,148400000,"q22.3","gpos100"],[148400000,149600000,"q23.1","gneg"],[149600000,150300000,"q23.2","gpos25"],[150300000,154600000,"q23.3","gneg"],[154600000,159600000,"q24.1","gpos75"],[159600000,163500000,"q24.2","gneg"],[163500000,169500000,"q24.3","gpos75"],[169500000,177700000,"q31.1","gneg"],[177700000,180400000,"q31.2","gpos50"],[180400000,182700000,"q31.3","gneg"],[182700000,189100000,"q32.1","gpos75"],[189100000,191600000,"q32.2","gneg"],[191600000,197100000,"q32.3","gpos75"],[197100000,203500000,"q33.1","gneg"],[203500000,205600000,"q33.2","gpos50"],[205600000,209100000,"q33.3","gneg"],[209100000,215100000,"q34","gpos100"],[215100000,221300000,"q35","gneg"],[221300000,224900000,"q36.1","gpos75"],[224900000,225800000,"q36.2","gneg"],[225800000,230700000,"q36.3","gpos100"],[230700000,235300000,"q37.1","gneg"],[235300000,237000000,"q37.2","gpos50"],[237000000,242951149,"q37.3","gneg"]],3:[[0,3500000,"p26.3","gpos50"],[3500000,5500000,"p26.2","gneg"],[5500000,8700000,"p26.1","gpos50"],[8700000,11500000,"p25.3","gneg"],[11500000,12400000,"p25.2","gpos25"],[12400000,14700000,"p25.1","gneg"],[14700000,23800000,"p24.3","gpos100"],[23800000,26400000,"p24.2","gneg"],[26400000,30800000,"p24.1","gpos75"],[30800000,32100000,"p23","gneg"],[32100000,36500000,"p22.3","gpos50"],[36500000,39300000,"p22.2","gneg"],[39300000,43600000,"p22.1","gpos75"],[43600000,44400000,"p21.33","gneg"],[44400000,44700000,"p21.32","gpos50"],[44700000,51400000,"p21.31","gneg"],[51400000,51700000,"p21.2","gpos25"],[51700000,54400000,"p21.1","gneg"],[54400000,58500000,"p14.3","gpos50"],[58500000,63700000,"p14.2","gneg"],[63700000,71800000,"p14.1","gpos50"],[71800000,74200000,"p13","gneg"],[74200000,81800000,"p12.3","gpos75"],[81800000,83700000,"p12.2","gneg"],[83700000,87200000,"p12.1","gpos75"],[87200000,89400000,"p11.2","gneg"],[89400000,91700000,"p11.1","acen"],[91700000,93200000,"q11.1","acen"],[93200000,99800000,"q11.2","gvar"],[99800000,101500000,"q12.1","gneg"],[101500000,102500000,"q12.2","gpos25"],[102500000,104400000,"q12.3","gneg"],[104400000,107800000,"q13.11","gpos75"],[107800000,109500000,"q13.12","gneg"],[109500000,112800000,"q13.13","gpos50"],[112800000,115000000,"q13.2","gneg"],[115000000,118800000,"q13.31","gpos75"],[118800000,120500000,"q13.32","gneg"],[120500000,123400000,"q13.33","gpos75"],[123400000,125400000,"q21.1","gneg"],[125400000,127700000,"q21.2","gpos25"],[127700000,131500000,"q21.3","gneg"],[131500000,135700000,"q22.1","gpos25"],[135700000,137400000,"q22.2","gneg"],[137400000,140400000,"q22.3","gpos25"],[140400000,144400000,"q23","gneg"],[144400000,150400000,"q24","gpos100"],[150400000,153500000,"q25.1","gneg"],[153500000,156300000,"q25.2","gpos50"],[156300000,158100000,"q25.31","gneg"],[158100000,159900000,"q25.32","gpos50"],[159900000,161200000,"q25.33","gneg"],[161200000,169200000,"q26.1","gpos100"],[169200000,172500000,"q26.2","gneg"],[172500000,177300000,"q26.31","gpos75"],[177300000,180600000,"q26.32","gneg"],[180600000,184200000,"q26.33","gpos75"],[184200000,186000000,"q27.1","gneg"],[186000000,187500000,"q27.2","gpos25"],[187500000,189400000,"q27.3","gneg"],[189400000,193800000,"q28","gpos75"],[193800000,199501827,"q29","gneg"]],4:[[0,3100000,"p16.3","gneg"],[3100000,5200000,"p16.2","gpos25"],[5200000,10900000,"p16.1","gneg"],[10900000,15300000,"p15.33","gpos50"],[15300000,18500000,"p15.32","gneg"],[18500000,23100000,"p15.31","gpos75"],[23100000,27900000,"p15.2","gneg"],[27900000,35500000,"p15.1","gpos100"],[35500000,40900000,"p14","gneg"],[40900000,45600000,"p13","gpos50"],[45600000,48700000,"p12","gneg"],[48700000,50700000,"p11","acen"],[50700000,52400000,"q11","acen"],[52400000,59200000,"q12","gneg"],[59200000,66300000,"q13.1","gpos100"],[66300000,70400000,"q13.2","gneg"],[70400000,76500000,"q13.3","gpos75"],[76500000,79200000,"q21.1","gneg"],[79200000,82600000,"q21.21","gpos50"],[82600000,84300000,"q21.22","gneg"],[84300000,87100000,"q21.23","gpos25"],[87100000,88200000,"q21.3","gneg"],[88200000,94000000,"q22.1","gpos75"],[94000000,95400000,"q22.2","gneg"],[95400000,99100000,"q22.3","gpos75"],[99100000,102500000,"q23","gneg"],[102500000,107900000,"q24","gpos50"],[107900000,114100000,"q25","gneg"],[114100000,120600000,"q26","gpos75"],[120600000,124000000,"q27","gneg"],[124000000,129100000,"q28.1","gpos50"],[129100000,131300000,"q28.2","gneg"],[131300000,139500000,"q28.3","gpos100"],[139500000,141700000,"q31.1","gneg"],[141700000,145000000,"q31.21","gpos25"],[145000000,147700000,"q31.22","gneg"],[147700000,151000000,"q31.23","gpos25"],[151000000,155100000,"q31.3","gneg"],[155100000,161500000,"q32.1","gpos100"],[161500000,164500000,"q32.2","gneg"],[164500000,170400000,"q32.3","gpos100"],[170400000,172200000,"q33","gneg"],[172200000,176600000,"q34.1","gpos75"],[176600000,177800000,"q34.2","gneg"],[177800000,182600000,"q34.3","gpos100"],[182600000,187300000,"q35.1","gneg"],[187300000,191273063,"q35.2","gpos25"]],5:[[0,4400000,"p15.33","gneg"],[4400000,6000000,"p15.32","gpos25"],[6000000,8200000,"p15.31","gneg"],[8200000,15100000,"p15.2","gpos50"],[15100000,18500000,"p15.1","gneg"],[18500000,23300000,"p14.3","gpos100"],[23300000,24700000,"p14.2","gneg"],[24700000,29300000,"p14.1","gpos100"],[29300000,34400000,"p13.3","gneg"],[34400000,38500000,"p13.2","gpos25"],[38500000,42400000,"p13.1","gneg"],[42400000,45800000,"p12","gpos50"],[45800000,47700000,"p11","acen"],[47700000,50500000,"q11.1","acen"],[50500000,58900000,"q11.2","gneg"],[58900000,63000000,"q12.1","gpos75"],[63000000,63700000,"q12.2","gneg"],[63700000,66500000,"q12.3","gpos75"],[66500000,68400000,"q13.1","gneg"],[68400000,73300000,"q13.2","gpos50"],[73300000,76400000,"q13.3","gneg"],[76400000,81300000,"q14.1","gpos50"],[81300000,82800000,"q14.2","gneg"],[82800000,91900000,"q14.3","gpos100"],[91900000,97300000,"q15","gneg"],[97300000,102800000,"q21.1","gpos100"],[102800000,104500000,"q21.2","gneg"],[104500000,109600000,"q21.3","gpos100"],[109600000,111500000,"q22.1","gneg"],[111500000,113100000,"q22.2","gpos50"],[113100000,115200000,"q22.3","gneg"],[115200000,121500000,"q23.1","gpos100"],[121500000,127300000,"q23.2","gneg"],[127300000,130400000,"q23.3","gpos100"],[130400000,135400000,"q31.1","gneg"],[135400000,139000000,"q31.2","gpos25"],[139000000,143100000,"q31.3","gneg"],[143100000,147200000,"q32","gpos75"],[147200000,152100000,"q33.1","gneg"],[152100000,155600000,"q33.2","gpos50"],[155600000,159900000,"q33.3","gneg"],[159900000,167400000,"q34","gpos100"],[167400000,172200000,"q35.1","gneg"],[172200000,176500000,"q35.2","gpos25"],[176500000,180857866,"q35.3","gneg"]],6:[[0,2300000,"p25.3","gneg"],[2300000,4100000,"p25.2","gpos25"],[4100000,7000000,"p25.1","gneg"],[7000000,10600000,"p24.3","gpos50"],[10600000,11200000,"p24.2","gneg"],[11200000,13500000,"p24.1","gpos25"],[13500000,15500000,"p23","gneg"],[15500000,23500000,"p22.3","gpos75"],[23500000,26100000,"p22.2","gneg"],[26100000,29900000,"p22.1","gpos50"],[29900000,31900000,"p21.33","gneg"],[31900000,33600000,"p21.32","gpos25"],[33600000,36800000,"p21.31","gneg"],[36800000,40600000,"p21.2","gpos25"],[40600000,45200000,"p21.1","gneg"],[45200000,51100000,"p12.3","gpos100"],[51100000,52600000,"p12.2","gneg"],[52600000,57200000,"p12.1","gpos100"],[57200000,58400000,"p11.2","gneg"],[58400000,60500000,"p11.1","acen"],[60500000,63400000,"q11.1","acen"],[63400000,63500000,"q11.2","gneg"],[63500000,70000000,"q12","gpos100"],[70000000,75900000,"q13","gneg"],[75900000,83900000,"q14.1","gpos50"],[83900000,84700000,"q14.2","gneg"],[84700000,87500000,"q14.3","gpos50"],[87500000,92100000,"q15","gneg"],[92100000,98700000,"q16.1","gpos100"],[98700000,99900000,"q16.2","gneg"],[99900000,104800000,"q16.3","gpos100"],[104800000,113900000,"q21","gneg"],[113900000,117100000,"q22.1","gpos75"],[117100000,118600000,"q22.2","gneg"],[118600000,126200000,"q22.31","gpos100"],[126200000,127300000,"q22.32","gneg"],[127300000,130400000,"q22.33","gpos75"],[130400000,131300000,"q23.1","gneg"],[131300000,135200000,"q23.2","gpos50"],[135200000,139100000,"q23.3","gneg"],[139100000,142900000,"q24.1","gpos75"],[142900000,145700000,"q24.2","gneg"],[145700000,149100000,"q24.3","gpos75"],[149100000,152600000,"q25.1","gneg"],[152600000,155600000,"q25.2","gpos50"],[155600000,160900000,"q25.3","gneg"],[160900000,164400000,"q26","gpos50"],[164400000,170899992,"q27","gneg"]],7:[[0,2100000,"p22.3","gneg"],[2100000,4500000,"p22.2","gpos25"],[4500000,7200000,"p22.1","gneg"],[7200000,13300000,"p21.3","gpos100"],[13300000,15200000,"p21.2","gneg"],[15200000,19500000,"p21.1","gpos100"],[19500000,24900000,"p15.3","gneg"],[24900000,28000000,"p15.2","gpos50"],[28000000,31800000,"p15.1","gneg"],[31800000,35600000,"p14.3","gpos75"],[35600000,37500000,"p14.2","gneg"],[37500000,43300000,"p14.1","gpos75"],[43300000,46600000,"p13","gneg"],[46600000,49800000,"p12.3","gpos75"],[49800000,50900000,"p12.2","gneg"],[50900000,53900000,"p12.1","gpos75"],[53900000,57400000,"p11.2","gneg"],[57400000,59100000,"p11.1","acen"],[59100000,61100000,"q11.1","acen"],[61100000,66100000,"q11.21","gneg"],[66100000,71800000,"q11.22","gpos50"],[71800000,77400000,"q11.23","gneg"],[77400000,86200000,"q21.11","gpos100"],[86200000,88000000,"q21.12","gneg"],[88000000,90900000,"q21.13","gpos75"],[90900000,92600000,"q21.2","gneg"],[92600000,97900000,"q21.3","gpos75"],[97900000,104400000,"q22.1","gneg"],[104400000,105900000,"q22.2","gpos50"],[105900000,107200000,"q22.3","gneg"],[107200000,114400000,"q31.1","gpos75"],[114400000,117200000,"q31.2","gneg"],[117200000,120900000,"q31.31","gpos75"],[120900000,123600000,"q31.32","gneg"],[123600000,126900000,"q31.33","gpos75"],[126900000,129000000,"q32.1","gneg"],[129000000,130100000,"q32.2","gpos25"],[130100000,132400000,"q32.3","gneg"],[132400000,137300000,"q33","gpos50"],[137300000,142800000,"q34","gneg"],[142800000,147500000,"q35","gpos75"],[147500000,152200000,"q36.1","gneg"],[152200000,154700000,"q36.2","gpos25"],[154700000,158821424,"q36.3","gneg"]],8:[[0,2200000,"p23.3","gneg"],[2200000,6200000,"p23.2","gpos75"],[6200000,12700000,"p23.1","gneg"],[12700000,19100000,"p22","gpos100"],[19100000,23400000,"p21.3","gneg"],[23400000,27400000,"p21.2","gpos50"],[27400000,29700000,"p21.1","gneg"],[29700000,38500000,"p12","gpos75"],[38500000,39500000,"p11.23","gneg"],[39500000,39900000,"p11.22","gpos25"],[39900000,43200000,"p11.21","gneg"],[43200000,45200000,"p11.1","acen"],[45200000,48100000,"q11.1","acen"],[48100000,50400000,"q11.21","gneg"],[50400000,52800000,"q11.22","gpos75"],[52800000,55600000,"q11.23","gneg"],[55600000,61700000,"q12.1","gpos50"],[61700000,62400000,"q12.2","gneg"],[62400000,66100000,"q12.3","gpos50"],[66100000,68100000,"q13.1","gneg"],[68100000,70600000,"q13.2","gpos50"],[70600000,74000000,"q13.3","gneg"],[74000000,78500000,"q21.11","gpos100"],[78500000,80300000,"q21.12","gneg"],[80300000,84900000,"q21.13","gpos75"],[84900000,87200000,"q21.2","gneg"],[87200000,93500000,"q21.3","gpos100"],[93500000,99100000,"q22.1","gneg"],[99100000,101600000,"q22.2","gpos25"],[101600000,106100000,"q22.3","gneg"],[106100000,110600000,"q23.1","gpos75"],[110600000,112200000,"q23.2","gneg"],[112200000,117700000,"q23.3","gpos100"],[117700000,119200000,"q24.11","gneg"],[119200000,122500000,"q24.12","gpos50"],[122500000,127300000,"q24.13","gneg"],[127300000,131500000,"q24.21","gpos50"],[131500000,136500000,"q24.22","gneg"],[136500000,140000000,"q24.23","gpos75"],[140000000,146274826,"q24.3","gneg"]],9:[[0,2200000,"p24.3","gneg"],[2200000,4600000,"p24.2","gpos25"],[4600000,9000000,"p24.1","gneg"],[9000000,14100000,"p23","gpos75"],[14100000,16600000,"p22.3","gneg"],[16600000,18500000,"p22.2","gpos25"],[18500000,19900000,"p22.1","gneg"],[19900000,25500000,"p21.3","gpos100"],[25500000,28100000,"p21.2","gneg"],[28100000,32800000,"p21.1","gpos100"],[32800000,36300000,"p13.3","gneg"],[36300000,38000000,"p13.2","gpos25"],[38000000,40200000,"p13.1","gneg"],[40200000,42400000,"p12","gpos50"],[42400000,46700000,"p11.2","gneg"],[46700000,51800000,"p11.1","acen"],[51800000,60300000,"q11","acen"],[60300000,70000000,"q12","gvar"],[70000000,70500000,"q13","gneg"],[70500000,72700000,"q21.11","gpos25"],[72700000,73100000,"q21.12","gneg"],[73100000,79300000,"q21.13","gpos50"],[79300000,80300000,"q21.2","gneg"],[80300000,83400000,"q21.31","gpos50"],[83400000,86100000,"q21.32","gneg"],[86100000,89600000,"q21.33","gpos50"],[89600000,91000000,"q22.1","gneg"],[91000000,93000000,"q22.2","gpos25"],[93000000,95600000,"q22.31","gneg"],[95600000,98200000,"q22.32","gpos25"],[98200000,101600000,"q22.33","gneg"],[101600000,107200000,"q31.1","gpos100"],[107200000,110300000,"q31.2","gneg"],[110300000,113900000,"q31.3","gpos25"],[113900000,116700000,"q32","gneg"],[116700000,122000000,"q33.1","gpos75"],[122000000,125800000,"q33.2","gneg"],[125800000,129300000,"q33.3","gpos25"],[129300000,132500000,"q34.11","gneg"],[132500000,132800000,"q34.12","gpos25"],[132800000,134900000,"q34.13","gneg"],[134900000,136600000,"q34.2","gpos25"],[136600000,140273252,"q34.3","gneg"]],10:[[0,3000000,"p15.3","gneg"],[3000000,3800000,"p15.2","gpos25"],[3800000,6700000,"p15.1","gneg"],[6700000,12300000,"p14","gpos75"],[12300000,17300000,"p13","gneg"],[17300000,19900000,"p12.33","gpos75"],[19900000,20500000,"p12.32","gneg"],[20500000,22800000,"p12.31","gpos75"],[22800000,24100000,"p12.2","gneg"],[24100000,28300000,"p12.1","gpos50"],[28300000,31400000,"p11.23","gneg"],[31400000,34500000,"p11.22","gpos25"],[34500000,38800000,"p11.21","gneg"],[38800000,40300000,"p11.1","acen"],[40300000,42100000,"q11.1","acen"],[42100000,46100000,"q11.21","gneg"],[46100000,50100000,"q11.22","gpos25"],[50100000,53300000,"q11.23","gneg"],[53300000,61200000,"q21.1","gpos100"],[61200000,64800000,"q21.2","gneg"],[64800000,71300000,"q21.3","gpos100"],[71300000,74600000,"q22.1","gneg"],[74600000,77400000,"q22.2","gpos50"],[77400000,82000000,"q22.3","gneg"],[82000000,87900000,"q23.1","gpos100"],[87900000,89600000,"q23.2","gneg"],[89600000,92900000,"q23.31","gpos75"],[92900000,94200000,"q23.32","gneg"],[94200000,98000000,"q23.33","gpos50"],[98000000,99400000,"q24.1","gneg"],[99400000,102000000,"q24.2","gpos50"],[102000000,103000000,"q24.31","gneg"],[103000000,104900000,"q24.32","gpos25"],[104900000,105700000,"q24.33","gneg"],[105700000,111800000,"q25.1","gpos100"],[111800000,114900000,"q25.2","gneg"],[114900000,119100000,"q25.3","gpos75"],[119100000,121700000,"q26.11","gneg"],[121700000,123100000,"q26.12","gpos50"],[123100000,127400000,"q26.13","gneg"],[127400000,130500000,"q26.2","gpos50"],[130500000,135374737,"q26.3","gneg"]],11:[[0,2800000,"p15.5","gneg"],[2800000,10700000,"p15.4","gpos50"],[10700000,12600000,"p15.3","gneg"],[12600000,16100000,"p15.2","gpos50"],[16100000,21600000,"p15.1","gneg"],[21600000,26000000,"p14.3","gpos100"],[26000000,27200000,"p14.2","gneg"],[27200000,31000000,"p14.1","gpos75"],[31000000,36400000,"p13","gneg"],[36400000,43400000,"p12","gpos100"],[43400000,48800000,"p11.2","gneg"],[48800000,51400000,"p11.12","gpos75"],[51400000,52900000,"p11.11","acen"],[52900000,56400000,"q11","acen"],[56400000,59700000,"q12.1","gpos75"],[59700000,61400000,"q12.2","gneg"],[61400000,63100000,"q12.3","gpos25"],[63100000,67100000,"q13.1","gneg"],[67100000,69200000,"q13.2","gpos25"],[69200000,70700000,"q13.3","gneg"],[70700000,74900000,"q13.4","gpos50"],[74900000,76700000,"q13.5","gneg"],[76700000,85300000,"q14.1","gpos100"],[85300000,87900000,"q14.2","gneg"],[87900000,92300000,"q14.3","gpos100"],[92300000,96700000,"q21","gneg"],[96700000,101600000,"q22.1","gpos100"],[101600000,102400000,"q22.2","gneg"],[102400000,110000000,"q22.3","gpos100"],[110000000,112800000,"q23.1","gneg"],[112800000,115400000,"q23.2","gpos50"],[115400000,120700000,"q23.3","gneg"],[120700000,123500000,"q24.1","gpos50"],[123500000,127400000,"q24.2","gneg"],[127400000,130300000,"q24.3","gpos50"],[130300000,134452384,"q25","gneg"]],12:[[0,3100000,"p13.33","gneg"],[3100000,5300000,"p13.32","gpos25"],[5300000,10000000,"p13.31","gneg"],[10000000,12600000,"p13.2","gpos75"],[12600000,14800000,"p13.1","gneg"],[14800000,19900000,"p12.3","gpos100"],[19900000,21200000,"p12.2","gneg"],[21200000,26300000,"p12.1","gpos100"],[26300000,27700000,"p11.23","gneg"],[27700000,30600000,"p11.22","gpos50"],[30600000,33200000,"p11.21","gneg"],[33200000,35400000,"p11.1","acen"],[35400000,36500000,"q11","acen"],[36500000,44600000,"q12","gpos100"],[44600000,47400000,"q13.11","gneg"],[47400000,48400000,"q13.12","gpos25"],[48400000,53100000,"q13.13","gneg"],[53100000,55200000,"q13.2","gpos25"],[55200000,56300000,"q13.3","gneg"],[56300000,61400000,"q14.1","gpos75"],[61400000,63400000,"q14.2","gneg"],[63400000,66000000,"q14.3","gpos50"],[66000000,69800000,"q15","gneg"],[69800000,74100000,"q21.1","gpos75"],[74100000,78700000,"q21.2","gneg"],[78700000,85100000,"q21.31","gpos100"],[85100000,87500000,"q21.32","gneg"],[87500000,91200000,"q21.33","gpos100"],[91200000,94800000,"q22","gneg"],[94800000,100000000,"q23.1","gpos75"],[100000000,102400000,"q23.2","gneg"],[102400000,107500000,"q23.3","gpos50"],[107500000,110200000,"q24.11","gneg"],[110200000,110800000,"q24.12","gpos25"],[110800000,112800000,"q24.13","gneg"],[112800000,115300000,"q24.21","gpos50"],[115300000,116700000,"q24.22","gneg"],[116700000,119100000,"q24.23","gpos50"],[119100000,124500000,"q24.31","gneg"],[124500000,128700000,"q24.32","gpos50"],[128700000,132349534,"q24.33","gneg"]],13:[[0,3800000,"p13","gvar"],[3800000,8300000,"p12","stalk"],[8300000,13500000,"p11.2","gvar"],[13500000,16000000,"p11.1","acen"],[16000000,18400000,"q11","acen"],[18400000,22200000,"q12.11","gneg"],[22200000,24400000,"q12.12","gpos25"],[24400000,26700000,"q12.13","gneg"],[26700000,27800000,"q12.2","gpos25"],[27800000,31100000,"q12.3","gneg"],[31100000,32900000,"q13.1","gpos50"],[32900000,34700000,"q13.2","gneg"],[34700000,39500000,"q13.3","gpos75"],[39500000,44300000,"q14.11","gneg"],[44300000,45900000,"q14.12","gpos25"],[45900000,46200000,"q14.13","gneg"],[46200000,48900000,"q14.2","gpos50"],[48900000,52200000,"q14.3","gneg"],[52200000,57600000,"q21.1","gpos100"],[57600000,60500000,"q21.2","gneg"],[60500000,64100000,"q21.31","gpos75"],[64100000,67200000,"q21.32","gneg"],[67200000,72100000,"q21.33","gpos100"],[72100000,74200000,"q22.1","gneg"],[74200000,76000000,"q22.2","gpos50"],[76000000,77800000,"q22.3","gneg"],[77800000,86500000,"q31.1","gpos100"],[86500000,88800000,"q31.2","gneg"],[88800000,93800000,"q31.3","gpos100"],[93800000,97000000,"q32.1","gneg"],[97000000,98100000,"q32.2","gpos25"],[98100000,100500000,"q32.3","gneg"],[100500000,103700000,"q33.1","gpos100"],[103700000,105800000,"q33.2","gneg"],[105800000,109100000,"q33.3","gpos100"],[109100000,114142980,"q34","gneg"]],14:[[0,3100000,"p13","gvar"],[3100000,6700000,"p12","stalk"],[6700000,13600000,"p11.2","gvar"],[13600000,15600000,"p11.1","acen"],[15600000,19100000,"q11.1","acen"],[19100000,23600000,"q11.2","gneg"],[23600000,31800000,"q12","gpos100"],[31800000,34100000,"q13.1","gneg"],[34100000,35600000,"q13.2","gpos50"],[35600000,36900000,"q13.3","gneg"],[36900000,41000000,"q21.1","gpos100"],[41000000,43200000,"q21.2","gneg"],[43200000,48300000,"q21.3","gpos100"],[48300000,52300000,"q22.1","gneg"],[52300000,54400000,"q22.2","gpos25"],[54400000,55800000,"q22.3","gneg"],[55800000,61200000,"q23.1","gpos75"],[61200000,64000000,"q23.2","gneg"],[64000000,67000000,"q23.3","gpos50"],[67000000,69300000,"q24.1","gneg"],[69300000,72900000,"q24.2","gpos50"],[72900000,78400000,"q24.3","gneg"],[78400000,82600000,"q31.1","gpos100"],[82600000,84000000,"q31.2","gneg"],[84000000,88900000,"q31.3","gpos100"],[88900000,90500000,"q32.11","gneg"],[90500000,92800000,"q32.12","gpos25"],[92800000,95400000,"q32.13","gneg"],[95400000,100400000,"q32.2","gpos50"],[100400000,102200000,"q32.31","gneg"],[102200000,103000000,"q32.32","gpos50"],[103000000,106368585,"q32.33","gneg"]],15:[[0,3500000,"p13","gvar"],[3500000,7900000,"p12","stalk"],[7900000,14100000,"p11.2","gvar"],[14100000,17000000,"p11.1","acen"],[17000000,18400000,"q11.1","acen"],[18400000,23300000,"q11.2","gneg"],[23300000,25700000,"q12","gpos50"],[25700000,28000000,"q13.1","gneg"],[28000000,29000000,"q13.2","gpos50"],[29000000,31400000,"q13.3","gneg"],[31400000,37900000,"q14","gpos75"],[37900000,40700000,"q15.1","gneg"],[40700000,41400000,"q15.2","gpos25"],[41400000,42700000,"q15.3","gneg"],[42700000,47600000,"q21.1","gpos75"],[47600000,51100000,"q21.2","gneg"],[51100000,55800000,"q21.3","gpos75"],[55800000,57100000,"q22.1","gneg"],[57100000,61500000,"q22.2","gpos25"],[61500000,64900000,"q22.31","gneg"],[64900000,65000000,"q22.32","gpos25"],[65000000,65300000,"q22.33","gneg"],[65300000,70400000,"q23","gpos25"],[70400000,73100000,"q24.1","gneg"],[73100000,74400000,"q24.2","gpos25"],[74400000,76100000,"q24.3","gneg"],[76100000,79500000,"q25.1","gpos50"],[79500000,83000000,"q25.2","gneg"],[83000000,86900000,"q25.3","gpos50"],[86900000,92100000,"q26.1","gneg"],[92100000,96300000,"q26.2","gpos50"],[96300000,100338915,"q26.3","gneg"]],16:[[0,6300000,"p13.3","gneg"],[6300000,10300000,"p13.2","gpos50"],[10300000,12500000,"p13.13","gneg"],[12500000,14700000,"p13.12","gpos50"],[14700000,16700000,"p13.11","gneg"],[16700000,20500000,"p12.3","gpos50"],[20500000,21700000,"p12.2","gneg"],[21700000,27600000,"p12.1","gpos50"],[27600000,34400000,"p11.2","gneg"],[34400000,38200000,"p11.1","acen"],[38200000,40700000,"q11.1","acen"],[40700000,45500000,"q11.2","gvar"],[45500000,51200000,"q12.1","gneg"],[51200000,54500000,"q12.2","gpos50"],[54500000,56700000,"q13","gneg"],[56700000,65200000,"q21","gpos100"],[65200000,69400000,"q22.1","gneg"],[69400000,69800000,"q22.2","gpos50"],[69800000,73300000,"q22.3","gneg"],[73300000,78200000,"q23.1","gpos75"],[78200000,80500000,"q23.2","gneg"],[80500000,82700000,"q23.3","gpos50"],[82700000,85600000,"q24.1","gneg"],[85600000,87200000,"q24.2","gpos25"],[87200000,88827254,"q24.3","gneg"]],17:[[0,3600000,"p13.3","gneg"],[3600000,6800000,"p13.2","gpos50"],[6800000,11200000,"p13.1","gneg"],[11200000,15900000,"p12","gpos75"],[15900000,22100000,"p11.2","gneg"],[22100000,22200000,"p11.1","acen"],[22200000,23200000,"q11.1","acen"],[23200000,28800000,"q11.2","gneg"],[28800000,35400000,"q12","gpos50"],[35400000,35600000,"q21.1","gneg"],[35600000,37800000,"q21.2","gpos25"],[37800000,41900000,"q21.31","gneg"],[41900000,44800000,"q21.32","gpos25"],[44800000,47600000,"q21.33","gneg"],[47600000,54900000,"q22","gpos75"],[54900000,55600000,"q23.1","gneg"],[55600000,58400000,"q23.2","gpos75"],[58400000,59900000,"q23.3","gneg"],[59900000,61600000,"q24.1","gpos50"],[61600000,64600000,"q24.2","gneg"],[64600000,68400000,"q24.3","gpos75"],[68400000,72200000,"q25.1","gneg"],[72200000,72900000,"q25.2","gpos25"],[72900000,78774742,"q25.3","gneg"]],18:[[0,2900000,"p11.32","gneg"],[2900000,7200000,"p11.31","gpos50"],[7200000,8500000,"p11.23","gneg"],[8500000,10900000,"p11.22","gpos25"],[10900000,15400000,"p11.21","gneg"],[15400000,16100000,"p11.1","acen"],[16100000,17300000,"q11.1","acen"],[17300000,23300000,"q11.2","gneg"],[23300000,31000000,"q12.1","gpos100"],[31000000,35500000,"q12.2","gneg"],[35500000,41800000,"q12.3","gpos75"],[41800000,46400000,"q21.1","gneg"],[46400000,52000000,"q21.2","gpos75"],[52000000,54400000,"q21.31","gneg"],[54400000,57100000,"q21.32","gpos50"],[57100000,59800000,"q21.33","gneg"],[59800000,64900000,"q22.1","gpos100"],[64900000,66900000,"q22.2","gneg"],[66900000,71300000,"q22.3","gpos25"],[71300000,76117153,"q23","gneg"]],19:[[0,6900000,"p13.3","gneg"],[6900000,12600000,"p13.2","gpos25"],[12600000,13800000,"p13.13","gneg"],[13800000,16100000,"p13.12","gpos25"],[16100000,19800000,"p13.11","gneg"],[19800000,26700000,"p12","gvar"],[26700000,28500000,"p11","acen"],[28500000,30200000,"q11","acen"],[30200000,37100000,"q12","gvar"],[37100000,40300000,"q13.11","gneg"],[40300000,43000000,"q13.12","gpos25"],[43000000,43400000,"q13.13","gneg"],[43400000,47800000,"q13.2","gpos25"],[47800000,50000000,"q13.31","gneg"],[50000000,53800000,"q13.32","gpos25"],[53800000,57600000,"q13.33","gneg"],[57600000,59100000,"q13.41","gpos25"],[59100000,61400000,"q13.42","gneg"],[61400000,63811651,"q13.43","gpos25"]],20:[[0,5000000,"p13","gneg"],[5000000,9000000,"p12.3","gpos75"],[9000000,11900000,"p12.2","gneg"],[11900000,17800000,"p12.1","gpos75"],[17800000,21200000,"p11.23","gneg"],[21200000,22300000,"p11.22","gpos25"],[22300000,25700000,"p11.21","gneg"],[25700000,27100000,"p11.1","acen"],[27100000,28400000,"q11.1","acen"],[28400000,31500000,"q11.21","gneg"],[31500000,33900000,"q11.22","gpos25"],[33900000,37100000,"q11.23","gneg"],[37100000,41100000,"q12","gpos75"],[41100000,41600000,"q13.11","gneg"],[41600000,45800000,"q13.12","gpos25"],[45800000,49200000,"q13.13","gneg"],[49200000,54400000,"q13.2","gpos75"],[54400000,55900000,"q13.31","gneg"],[55900000,57900000,"q13.32","gpos50"],[57900000,62435964,"q13.33","gneg"]],21:[[0,2900000,"p13","gvar"],[2900000,6300000,"p12","stalk"],[6300000,10000000,"p11.2","gvar"],[10000000,12300000,"p11.1","acen"],[12300000,13200000,"q11.1","acen"],[13200000,15300000,"q11.2","gneg"],[15300000,22900000,"q21.1","gpos100"],[22900000,25800000,"q21.2","gneg"],[25800000,30500000,"q21.3","gpos75"],[30500000,34700000,"q22.11","gneg"],[34700000,36700000,"q22.12","gpos50"],[36700000,38600000,"q22.13","gneg"],[38600000,41400000,"q22.2","gpos50"],[41400000,46944323,"q22.3","gneg"]],22:[[0,3000000,"p13","gvar"],[3000000,6600000,"p12","stalk"],[6600000,9600000,"p11.2","gvar"],[9600000,11800000,"p11.1","acen"],[11800000,16300000,"q11.1","acen"],[16300000,20500000,"q11.21","gneg"],[20500000,21800000,"q11.22","gpos25"],[21800000,24300000,"q11.23","gneg"],[24300000,27900000,"q12.1","gpos50"],[27900000,30500000,"q12.2","gneg"],[30500000,35900000,"q12.3","gpos50"],[35900000,39300000,"q13.1","gneg"],[39300000,42600000,"q13.2","gpos50"],[42600000,47000000,"q13.31","gneg"],[47000000,48200000,"q13.32","gpos50"],[48200000,49691432,"q13.33","gneg"]],X:[[0,4300000,"p22.33","gneg"],[4300000,6000000,"p22.32","gpos50"],[6000000,9500000,"p22.31","gneg"],[9500000,17100000,"p22.2","gpos50"],[17100000,19200000,"p22.13","gneg"],[19200000,21800000,"p22.12","gpos50"],[21800000,24900000,"p22.11","gneg"],[24900000,29400000,"p21.3","gpos100"],[29400000,31500000,"p21.2","gneg"],[31500000,37500000,"p21.1","gpos100"],[37500000,42300000,"p11.4","gneg"],[42300000,47300000,"p11.3","gpos75"],[47300000,49700000,"p11.23","gneg"],[49700000,54700000,"p11.22","gpos25"],[54700000,56600000,"p11.21","gneg"],[56600000,59500000,"p11.1","acen"],[59500000,65000000,"q11.1","acen"],[65000000,65100000,"q11.2","gneg"],[65100000,67700000,"q12","gpos50"],[67700000,72200000,"q13.1","gneg"],[72200000,73800000,"q13.2","gpos50"],[73800000,76000000,"q13.3","gneg"],[76000000,84500000,"q21.1","gpos100"],[84500000,86200000,"q21.2","gneg"],[86200000,91900000,"q21.31","gpos100"],[91900000,93500000,"q21.32","gneg"],[93500000,98200000,"q21.33","gpos75"],[98200000,102500000,"q22.1","gneg"],[102500000,103600000,"q22.2","gpos50"],[103600000,110500000,"q22.3","gneg"],[110500000,116800000,"q23","gpos75"],[116800000,120700000,"q24","gneg"],[120700000,129800000,"q25","gpos100"],[129800000,130300000,"q26.1","gneg"],[130300000,133500000,"q26.2","gpos25"],[133500000,137800000,"q26.3","gneg"],[137800000,140100000,"q27.1","gpos75"],[140100000,141900000,"q27.2","gneg"],[141900000,146900000,"q27.3","gpos100"],[146900000,154913754,"q28","gneg"]],Y:[[0,1700000,"p11.32","gneg"],[1700000,3300000,"p11.31","gpos50"],[3300000,11200000,"p11.2","gneg"],[11200000,11300000,"p11.1","acen"],[11300000,12500000,"q11.1","acen"],[12500000,14300000,"q11.21","gneg"],[14300000,19000000,"q11.221","gpos50"],[19000000,21300000,"q11.222","gneg"],[21300000,25400000,"q11.223","gpos50"],[25400000,27200000,"q11.23","gneg"],[27200000,57772954,"q12","gvar"]]}}};CanvasXpress.graphTypes={Area:["Area"],AreaLine:["AreaLine"],Bar:["Bar"],BarLine:["BarLine"],Boxplot:["Boxplot"],Gantt:["Gantt"],Circular:["Circular"],Correlation:["Correlation"],DotLine:["DotLine"],Dotplot:["Dotplot"],Genome:["Genome"],Heatmap:["Heatmap"],Line:["Line"],Map:["Map"],Network:["Network"],ParallelCoordinates:["ParallelCoordinates"],Pie:["Pie"],Sankey:["Sankey"],Scatter2D:["Scatter2D"],ScatterBubble2D:["ScatterBubble2D"],Scatter3D:["Scatter3D"],Stacked:["Stacked"],StackedLine:["StackedLine"],StackedPercent:["StackedPercent"],StackedPercentLine:["StackedPercentLine"],TagCloud:["TagCloud"],Tree:["Tree"],Treemap:["Treemap"],Venn:["Venn"],DotGraphs:["Boxplot","DotLine","Dotplot"],LineGraphs:["AreaLine","BarLine","DotLine","Line","ParallelCoordinates","StackedLine","StackedPercentLine"],ScatterGraphs:["Scatter2D","ScatterBubble2D","Scatter3D"],StackedGraphs:["Stacked","StackedLine","StackedPercent","StackedPercentLine"],OneDPlots:["Area","AreaLine","Bar","BarLine","Boxplot","Gantt","DotLine","Dotplot","Heatmap","Line","ParallelCoordinates","Sankey","Stacked","StackedLine","StackedPercent","StackedPercentLine","TagCloud","Tree","Treemap"],OneDGraphs:["Area","AreaLine","Bar","BarLine","Boxplot","Gantt","DotLine","Dotplot","Heatmap","Line","ParallelCoordinates","Stacked","StackedLine","StackedPercent","StackedPercentLine"],OneTwoThreeeDGraphs:["Area","AreaLine","Bar","BarLine","Boxplot","Gantt","Circular","DotLine","Dotplot","Heatmap","Line","ParallelCoordinates","Pie","Scatter2D","ScatterBubble2D","Scatter3D","Stacked","StackedLine","StackedPercent","StackedPercentLine"],AllGraphs:["Area","AreaLine","Bar","BarLine","Boxplot","Gantt","Circular","Correlation","DotLine","Dotplot","Genome","Heatmap","Line","Map","Network","ParallelCoordinates","Pie","Sankey","Scatter2D","ScatterBubble2D","Scatter3D","Stacked","StackedLine","StackedPercent","StackedPercentLine","TagCloud","Tree","Treemap","Venn"],AGraphs:["Area","AreaLine","Bar","BarLine","Boxplot","Gantt","Circular","Correlation","DotLine","Dotplot","Heatmap","Line","Map","ParallelCoordinates","Sankey","Scatter2D","ScatterBubble2D","Scatter3D","Stacked","StackedLine","StackedPercent","StackedPercentLine","TagCloud","Tree","Treemap"],AttGraphs:["Bar","Boxplot","Dotplot","Treemap","Heatmap","Stacked","StackedLine","StackedPercent","StackedPercentLine","ParallelCoordinates","Line","Sankey","Tree","TagCloud","Gantt"],NoneDGraphs:["Genome","Map","Network","Sankey","TagCloud","Tree","Treemap","Venn"],NonSegregatable:["Genome","Map","Network","Sankey","TagCloud","Tree","Treemap","Venn","Circular","Gantt"]};CanvasXpress.colorNames={aliceblue:"f0f8ff",antiquewhite1:"ffefdb",antiquewhite2:"eedfcc",antiquewhite3:"cdc0b0",antiquewhite4:"8b8378",antiquewhite:"faebd7",aqua:"00ffff",aquamarine1:"7fffd4",aquamarine2:"76eec6",aquamarine4:"458b74",aquamarine:"7fffd4",azure1:"f0ffff",azure2:"e0eeee",azure3:"c1cdcd",azure4:"838b8b",azure:"f0ffff",beige:"f5f5dc",bisque1:"ffe4c4",bisque2:"eed5b7",bisque3:"cdb79e",bisque4:"8b7d6b",bisque:"ffe4c4",black:"000000",blanchedalmond:"ffebcd",blue:"0000ff",blue1:"0000ff",blue2:"0000ee",blue3:"1874cd",blue4:"00008b",blueviolet:"8a2be2",brown1:"ff4040",brown2:"ee3b3b",brown3:"cd3333",brown4:"8b2323",brown:"a52a2a",burlywood1:"ffd39b",burlywood2:"eec591",burlywood3:"cdaa7d",burlywood4:"8b7355",burlywood:"deb887",cadetblue1:"98f5ff",cadetblue2:"8ee5ee",cadetblue3:"7ac5cd",cadetblue4:"53868b",cadetblue:"5f9ea0",chartreuse1:"7fff00",chartreuse2:"76ee00",chartreuse3:"66cd00",chartreuse4:"458b00",chartreuse:"7fff00",chocolate1:"ff7f24",chocolate2:"ee7621",chocolate3:"cd661d",chocolate:"d2691e",coral1:"ff7256",coral2:"ee6a50",coral3:"cd5b45",coral4:"8b3e2f",coral:"ff7f50",cornflowerblue:"6495ed",cornsilk1:"fff8dc",cornsilk2:"eee8cd",cornsilk3:"cdc8b1",cornsilk4:"8b8878",cornsilk:"fff8dc",crimson:"dc143c",cyan:"00ffff",cyan1:"00ffff",cyan2:"00eeee",cyan3:"00cdcd",cyan4:"008b8b",darkblue:"00008b",darkcyan:"008b8b",darkgoldenrod1:"ffb90f",darkgoldenrod2:"eead0e",darkgoldenrod3:"cd950c",darkgoldenrod4:"8b6508",darkgoldenrod4:"8b6508",darkgoldenrod:"b8860b",darkgray:"a9a9a9",darkgreen:"006400",darkgrey:"a9a9a9",darkkhaki:"bdb76b",darkmagenta:"8b008b",darkolivegreen1:"caff70",darkolivegreen2:"bcee68",darkolivegreen3:"a2cd5a",darkolivegreen4:"6e8b3d",darkolivegreen:"556b2f",darkorange1:"ff7f00",darkorange2:"ee7600",darkorange3:"cd6600",darkorange4:"8b4500",darkorange:"ff8c00",darkorchid1:"bf3eff",darkorchid2:"b23aee",darkorchid3:"9a32cd",darkorchid4:"68228b",darkorchid:"9932cc",darkred:"8b0000",darksalmon:"e9967a",darkseagreen1:"c1ffc1",darkseagreen2:"b4eeb4",darkseagreen3:"9bcd9b",darkseagreen4:"698b69",darkseagreen:"8fbc8f",darkslateblue:"483d8b",darkslategray1:"97ffff",darkslategray2:"8deeee",darkslategray:"2f4f4f",darkslategray3:"79cdcd",darkslategray4:"528b8b",darkslategrey:"2f4f4f",darkturquoise:"00ced1",darkviolet:"9400d3",deeppink1:"ff1493",deeppink2:"ee1289",deeppink3:"cd1076",deeppink4:"8b0a50",deeppink:"ff1493",deepskyblue:"00bfff",deepskyblue1:"00bfff",deepskyblue2:"00b2ee",deepskyblue3:"009acd",deepskyblue4:"00688b",dimgray:"696969",dimgrey:"696969",dodgerblue1:"1e90ff",dodgerblue:"1e90ff",dodgerblue2:"1c86ee",dodgerblue3:"1874cd",dodgerblue4:"104e8b",firebrick1:"ff3030",firebrick2:"ee2c2c",firebrick3:"cd2626",firebrick4:"8b1a1a",firebrick:"b22222",floralwhite:"fffaf0",forestgreen:"228b22",fuchsia:"ff00ff",gainsboro:"dcdcdc",ghostwhite:"f8f8ff",gold1:"ffd700",gold2:"eec900",gold3:"cdad00",gold4:"8b7500",goldenrod1:"ffc125",goldenrod2:"eeb422",goldenrod3:"cd9b1d",goldenrod4:"8b6914",goldenrod:"daa520",goldenrod:"daa520",gold:"ffd700",gray10:"1a1a1a",gray1:"030303",gray11:"1c1c1c",gray12:"1f1f1f",gray13:"212121",gray14:"242424",gray15:"262626",gray16:"292929",gray17:"2b2b2b",gray18:"2e2e2e",gray19:"303030",gray20:"333333",gray2:"050505",gray21:"363636",gray22:"383838",gray23:"3b3b3b",gray24:"3d3d3d",gray25:"404040",gray26:"424242",gray27:"454545",gray28:"474747",gray29:"4a4a4a",gray30:"4d4d4d",gray3:"080808",gray31:"4f4f4f",gray32:"525252",gray33:"545454",gray34:"575757",gray35:"595959",gray36:"5c5c5c",gray37:"5e5e5e",gray38:"616161",gray39:"636363",gray40:"666666",gray4:"0a0a0a",gray41:"696969",gray42:"6b6b6b",gray43:"6e6e6e",gray44:"707070",gray45:"737373",gray46:"757575",gray47:"787878",gray48:"7a7a7a",gray49:"7d7d7d",gray50:"7f7f7f",gray5:"0d0d0d",gray51:"828282",gray52:"858585",gray53:"878787",gray54:"8a8a8a",gray55:"8c8c8c",gray56:"8f8f8f",gray57:"919191",gray58:"949494",gray59:"969696",gray60:"999999",gray6:"0f0f0f",gray61:"9c9c9c",gray62:"9e9e9e",gray63:"a1a1a1",gray64:"a3a3a3",gray65:"a6a6a6",gray66:"a8a8a8",gray67:"ababab",gray68:"adadad",gray69:"b0b0b0",gray70:"b3b3b3",gray7:"121212",gray71:"b5b5b5",gray72:"b8b8b8",gray73:"bababa",gray74:"bdbdbd",gray75:"bfbfbf",gray76:"c2c2c2",gray77:"c4c4c4",gray78:"c7c7c7",gray79:"c9c9c9",gray:"808080",gray80:"cccccc",gray8:"141414",gray81:"cfcfcf",gray82:"d1d1d1",gray83:"d4d4d4",gray84:"d6d6d6",gray85:"d9d9d9",gray86:"dbdbdb",gray87:"dedede",gray88:"e0e0e0",gray89:"e3e3e3",gray90:"e5e5e5",gray9:"171717",gray91:"e8e8e8",gray92:"ebebeb",gray93:"ededed",gray94:"f0f0f0",gray95:"f2f2f2",gray97:"f7f7f7",gray98:"fafafa",gray99:"fcfcfc",gray:"bebebe",green:"008000",green1:"00ff00",green2:"00ee00",green3:"00cd00",green4:"008b00",greenyellow:"adff2f",grey:"808080",honeydew1:"f0fff0",honeydew2:"e0eee0",honeydew3:"c1cdc1",honeydew4:"838b83",honeydew:"f0fff0",hotpink1:"ff6eb4",hotpink2:"ee6aa7",hotpink3:"cd6090",hotpink4:"8b3a62",hotpink:"ff69b4",indianred1:"ff6a6a",indianred2:"ee6363",indianred3:"cd5555",indianred4:"8b3a3a",indianred:"cd5c5c",indigo:"4b0082",ivory1:"fffff0",ivory2:"eeeee0",ivory3:"cdcdc1",ivory4:"8b8b83",ivory:"fffff0",khaki1:"fff68f",khaki2:"eee685",khaki3:"cdc673",khaki4:"8b864e",khaki:"f0e68c",lavenderblush1:"fff0f5",lavenderblush2:"eee0e5",lavenderblush3:"cdc1c5",lavenderblush4:"8b8386",lavenderblush:"fff0f5",lavender:"e6e6fa",lawngreen:"7cfc00",lemonchiffon1:"fffacd",lemonchiffon2:"eee9bf",lemonchiffon3:"cdc9a5",lemonchiffon4:"8b8970",lemonchiffon:"fffacd",lightblue1:"bfefff",lightblue2:"b2dfee",lightblue3:"9ac0cd",lightblue4:"68838b",lightblue:"add8e6",lightcoral:"f08080",lightcyan1:"e0ffff",lightcyan2:"d1eeee",lightcyan3:"b4cdcd",lightcyan4:"7a8b8b",lightcyan:"e0ffff",light:"eedd82",lightgoldenrod1:"ffec8b",lightgoldenrod2:"eedc82",lightgoldenrod3:"cdbe70",lightgoldenrod4:"8b814c",lightgoldenrodyellow:"fafad2",lightgray:"d3d3d3",lightgreen:"90ee90",lightgrey:"d3d3d3",lightpink1:"ffaeb9",lightpink2:"eea2ad",lightpink3:"cd8c95",lightpink4:"8b5f65",lightpink:"ffb6c1",lightsalmon1:"ffa07a",lightsalmon2:"ee9572",lightsalmon3:"cd8162",lightsalmon4:"8b5742",lightsalmon:"ffa07a",lightseagreen:"20b2aa",lightskyblue1:"b0e2ff",lightskyblue2:"a4d3ee",lightskyblue3:"8db6cd",lightskyblue4:"607b8b",lightskyblue:"87cefa",lightslateblue:"8470ff",lightslategray:"778899",lightslategrey:"778899",lightsteelblue1:"cae1ff",lightsteelblue2:"bcd2ee",lightsteelblue3:"a2b5cd",lightsteelblue4:"6e7b8b",lightsteelblue:"b0c4de",lightyellow1:"ffffe0",lightyellow2:"eeeed1",lightyellow3:"cdcdb4",lightyellow4:"8b8b7a",lightyellow:"ffffe0",lime:"00ff00",limegreen:"32cd32",linen:"faf0e6",magenta2:"ee00ee",magenta3:"cd00cd",magenta4:"8b008b",magenta:"ff00ff",maroon1:"ff34b3",maroon2:"ee30a7",maroon3:"cd2990",maroon4:"8b1c62",maroon:"800000",maroon:"b03060",medium:"66cdaa",mediumaquamarine:"66cdaa",mediumblue:"0000cd",mediumorchid1:"e066ff",mediumorchid2:"d15fee",mediumorchid3:"b452cd",mediumorchid4:"7a378b",mediumorchid:"ba55d3",mediumpurple1:"ab82ff",mediumpurple2:"9f79ee",mediumpurple3:"8968cd",mediumpurple4:"5d478b",mediumpurple:"9370db",mediumseagreen:"3cb371",mediumslateblue:"7b68ee",mediumspringgreen:"00fa9a",mediumturquoise:"48d1cc",mediumvioletred:"c71585",midnightblue:"191970",mintcream:"f5fffa",mistyrose1:"ffe4e1",mistyrose2:"eed5d2",mistyrose3:"cdb7b5",mistyrose4:"8b7d7b",mistyrose:"ffe4e1",moccasin:"ffe4b5",navajowhite1:"ffdead",navajowhite2:"eecfa1",navajowhite3:"cdb38b",navajowhite4:"8b795e",navajowhite:"ffdead",navy:"000080",navyblue:"000080",oldlace:"fdf5e6",olive:"808000",olivedrab1:"c0ff3e",olivedrab2:"b3ee3a",olivedrab4:"698b22",olivedrab:"6b8e23",orange1:"ffa500",orange2:"ee9a00",orange3:"cd8500",orange4:"8b5a00",orange:"ffa500",orangered1:"ff4500",orangered2:"ee4000",orangered3:"cd3700",orangered4:"8b2500",orangered:"ff4500",orchid1:"ff83fa",orchid2:"ee7ae9",orchid3:"cd69c9",orchid4:"8b4789",orchid:"da70d6",pale:"db7093",palegoldenrod:"eee8aa",palegreen1:"9aff9a",palegreen2:"90ee90",palegreen3:"7ccd7c",palegreen4:"548b54",palegreen:"98fb98",paleturquoise1:"bbffff",paleturquoise2:"aeeeee",paleturquoise3:"96cdcd",paleturquoise4:"668b8b",paleturquoise:"afeeee",palevioletred1:"ff82ab",palevioletred2:"ee799f",palevioletred3:"cd6889",palevioletred4:"8b475d",palevioletred:"db7093",papayawhip:"ffefd5",peachpuff1:"ffdab9",peachpuff2:"eecbad",peachpuff3:"cdaf95",peachpuff4:"8b7765",peachpuff:"ffdab9",peru:"cd853f",pink1:"ffb5c5",pink2:"eea9b8",pink3:"cd919e",pink4:"8b636c",pink:"ffc0cb",plum1:"ffbbff",plum2:"eeaeee",plum3:"cd96cd",plum4:"8b668b",plum:"dda0dd",powderblue:"b0e0e6",purple1:"9b30ff",purple2:"912cee",purple3:"7d26cd",purple4:"551a8b",purple:"800080",purple:"a020f0",rebeccapurple:"663399",red1:"ff0000",red2:"ee0000",red3:"cd0000",red4:"8b0000",red:"ff0000",rosybrown1:"ffc1c1",rosybrown2:"eeb4b4",rosybrown3:"cd9b9b",rosybrown4:"8b6969",rosybrown:"bc8f8f",royalblue1:"4876ff",royalblue2:"436eee",royalblue3:"3a5fcd",royalblue:"4169e1",royalblue4:"27408b",saddlebrown:"8b4513",salmon1:"ff8c69",salmon2:"ee8262",salmon3:"cd7054",salmon4:"8b4c39",salmon:"fa8072",sandybrown:"f4a460",seagreen1:"54ff9f",seagreen2:"4eee94",seagreen:"2e8b57",seagreen3:"43cd80",seagreen4:"2e8b57",seashell1:"fff5ee",seashell2:"eee5de",seashell3:"cdc5bf",seashell4:"8b8682",seashell:"fff5ee",sienna1:"ff8247",sienna2:"ee7942",sienna3:"cd6839",sienna4:"8b4726",sienna:"a0522d",silver:"c0c0c0",skyblue1:"87ceff",skyblue2:"7ec0ee",skyblue3:"6ca6cd",skyblue4:"4a708b",skyblue:"87ceeb",slateblue1:"836fff",slateblue2:"7a67ee",slateblue3:"6959cd",slateblue4:"473c8b",slateblue:"6a5acd",slategray1:"c6e2ff",slategray2:"b9d3ee",slategray3:"9fb6cd",slategray4:"6c7b8b",slategray:"708090",slategrey:"708090",snow1:"fffafa",snow2:"eee9e9",snow3:"cdc9c9",snow4:"8b8989",snow:"fffafa",springgreen:"00ff7f",springgreen1:"00ff7f",springgreen2:"00ee76",springgreen3:"00cd66",springgreen4:"008b45",steelblue1:"63b8ff",steelblue2:"5cacee",steelblue3:"4f94cd",steelblue4:"36648b",steelblue:"4682b4",tan1:"ffa54f",tan2:"ee9a49",tan3:"cd853f",tan4:"8b5a2b",tan:"d2b48c",teal:"008080",thistle1:"ffe1ff",thistle2:"eed2ee",thistle3:"cdb5cd",thistle4:"8b7b8b",thistle:"d8bfd8",tomato1:"ff6347",tomato2:"ee5c42",tomato3:"cd4f39",tomato4:"8b3626",tomato:"ff6347",turquoise1:"00f5ff",turquoise2:"00e5ee",turquoise3:"00c5cd",turquoise4:"00868b",turquoise:"40e0d0",violet:"ee82ee",violetred1:"ff3e96",violetred2:"ee3a8c",violetred3:"cd3278",violetred4:"8b2252",violetred:"d02090",wheat1:"ffe7ba",wheat2:"eed8ae",wheat3:"cdba96",wheat4:"8b7e66",wheat:"f5deb3",white:"ffffff",whitesmoke:"f5f5f5",yellow1:"ffff00",yellow2:"eeee00",yellow3:"cdcd00",yellow4:"8b8b00",yellow:"ffff00",yellowgreen:"9acd32"};CanvasXpress.setColorSchemes=function(){CanvasXpress.colorSchemes={YlGn:{3:"f7fcb9addd8e31a354",4:"ffffccc2e69978c679238443",5:"ffffccc2e69978c67931a354006837",6:"ffffccd9f0a3addd8e78c67931a354006837",7:"ffffccd9f0a3addd8e78c67941ab5d238443005a32",8:"ffffe5f7fcb9d9f0a3addd8e78c67941ab5d238443005a32",9:"ffffe5f7fcb9d9f0a3addd8e78c67941ab5d238443006837004529"},YlGnBu:{3:"edf8b17fcdbb2c7fb8",4:"ffffcca1dab441b6c4225ea8",5:"ffffcca1dab441b6c42c7fb8253494",6:"ffffccc7e9b47fcdbb41b6c42c7fb8253494",7:"ffffccc7e9b47fcdbb41b6c41d91c0225ea80c2c84",8:"ffffd9edf8b1c7e9b47fcdbb41b6c41d91c0225ea80c2c84",9:"ffffd9edf8b1c7e9b47fcdbb41b6c41d91c0225ea8253494081d58"},GnBu:{3:"e0f3dba8ddb543a2ca",4:"f0f9e8bae4bc7bccc42b8cbe",5:"f0f9e8bae4bc7bccc443a2ca0868ac",6:"f0f9e8ccebc5a8ddb57bccc443a2ca0868ac",7:"f0f9e8ccebc5a8ddb57bccc44eb3d32b8cbe08589e",8:"f7fcf0e0f3dbccebc5a8ddb57bccc44eb3d32b8cbe08589e",9:"f7fcf0e0f3dbccebc5a8ddb57bccc44eb3d32b8cbe0868ac084081"},BuGn:{3:"e5f5f999d8c92ca25f",4:"edf8fbb2e2e266c2a4238b45",5:"edf8fbb2e2e266c2a42ca25f006d2c",6:"edf8fbccece699d8c966c2a42ca25f006d2c",7:"edf8fbccece699d8c966c2a441ae76238b45005824",8:"f7fcfde5f5f9ccece699d8c966c2a441ae76238b45005824",9:"f7fcfde5f5f9ccece699d8c966c2a441ae76238b45006d2c00441b"},PuBuGn:{3:"ece2f0a6bddb1c9099",4:"f6eff7bdc9e167a9cf02818a",5:"f6eff7bdc9e167a9cf1c9099016c59",6:"f6eff7d0d1e6a6bddb67a9cf1c9099016c59",7:"f6eff7d0d1e6a6bddb67a9cf3690c002818a016450",8:"fff7fbece2f0d0d1e6a6bddb67a9cf3690c002818a016450",9:"fff7fbece2f0d0d1e6a6bddb67a9cf3690c002818a016c59014636"},PuBu:{3:"ece7f2a6bddb2b8cbe",4:"f1eef6bdc9e174a9cf0570b0",5:"f1eef6bdc9e174a9cf2b8cbe045a8d",6:"f1eef6d0d1e6a6bddb74a9cf2b8cbe045a8d",7:"f1eef6d0d1e6a6bddb74a9cf3690c00570b0034e7b",8:"fff7fbece7f2d0d1e6a6bddb74a9cf3690c00570b0034e7b",9:"fff7fbece7f2d0d1e6a6bddb74a9cf3690c00570b0045a8d023858"},BuPu:{3:"e0ecf49ebcda8856a7",4:"edf8fbb3cde38c96c688419d",5:"edf8fbb3cde38c96c68856a7810f7c",6:"edf8fbbfd3e69ebcda8c96c68856a7810f7c",7:"edf8fbbfd3e69ebcda8c96c68c6bb188419d6e016b",8:"f7fcfde0ecf4bfd3e69ebcda8c96c68c6bb188419d6e016b",9:"f7fcfde0ecf4bfd3e69ebcda8c96c68c6bb188419d810f7c4d004b"},RdPu:{3:"fde0ddfa9fb5c51b8a",4:"feebe2fbb4b9f768a1ae017e",5:"feebe2fbb4b9f768a1c51b8a7a0177",6:"feebe2fcc5c0fa9fb5f768a1c51b8a7a0177",7:"feebe2fcc5c0fa9fb5f768a1dd3497ae017e7a0177",8:"fff7f3fde0ddfcc5c0fa9fb5f768a1dd3497ae017e7a0177",9:"fff7f3fde0ddfcc5c0fa9fb5f768a1dd3497ae017e7a017749006a"},PuRd:{3:"e7e1efc994c7dd1c77",4:"f1eef6d7b5d8df65b0ce1256",5:"f1eef6d7b5d8df65b0dd1c77980043",6:"f1eef6d4b9dac994c7df65b0dd1c77980043",7:"f1eef6d4b9dac994c7df65b0e7298ace125691003f",8:"f7f4f9e7e1efd4b9dac994c7df65b0e7298ace125691003f",9:"f7f4f9e7e1efd4b9dac994c7df65b0e7298ace125698004367001f"},OrRd:{3:"fee8c8fdbb84e34a33",4:"fef0d9fdcc8afc8d59d7301f",5:"fef0d9fdcc8afc8d59e34a33b30000",6:"fef0d9fdd49efdbb84fc8d59e34a33b30000",7:"fef0d9fdd49efdbb84fc8d59ef6548d7301f990000",8:"fff7ecfee8c8fdd49efdbb84fc8d59ef6548d7301f990000",9:"fff7ecfee8c8fdd49efdbb84fc8d59ef6548d7301fb300007f0000"},YlOrRd:{3:"ffeda0feb24cf03b20",4:"ffffb2fecc5cfd8d3ce31a1c",5:"ffffb2fecc5cfd8d3cf03b20bd0026",6:"ffffb2fed976feb24cfd8d3cf03b20bd0026",7:"ffffb2fed976feb24cfd8d3cfc4e2ae31a1cb10026",8:"ffffccffeda0fed976feb24cfd8d3cfc4e2ae31a1cb10026",9:"ffffccffeda0fed976feb24cfd8d3cfc4e2ae31a1cbd0026800026"},YlOrBr:{3:"fff7bcfec44fd95f0e",4:"ffffd4fed98efe9929cc4c02",5:"ffffd4fed98efe9929d95f0e993404",6:"ffffd4fee391fec44ffe9929d95f0e993404",7:"ffffd4fee391fec44ffe9929ec7014cc4c028c2d04",8:"ffffe5fff7bcfee391fec44ffe9929ec7014cc4c028c2d04",9:"ffffe5fff7bcfee391fec44ffe9929ec7014cc4c02993404662506"},Purples:{3:"efedf5bcbddc756bb1",4:"f2f0f7cbc9e29e9ac86a51a3",5:"f2f0f7cbc9e29e9ac8756bb154278f",6:"f2f0f7dadaebbcbddc9e9ac8756bb154278f",7:"f2f0f7dadaebbcbddc9e9ac8807dba6a51a34a1486",8:"fcfbfdefedf5dadaebbcbddc9e9ac8807dba6a51a34a1486",9:"fcfbfdefedf5dadaebbcbddc9e9ac8807dba6a51a354278f3f007d"},Blues:{3:"deebf79ecae13182bd",4:"eff3ffbdd7e76baed62171b5",5:"eff3ffbdd7e76baed63182bd08519c",6:"eff3ffc6dbef9ecae16baed63182bd08519c",7:"eff3ffc6dbef9ecae16baed64292c62171b5084594",8:"f7fbffdeebf7c6dbef9ecae16baed64292c62171b5084594",9:"f7fbffdeebf7c6dbef9ecae16baed64292c62171b508519c08306b"},Greens:{3:"e5f5e0a1d99b31a354",4:"edf8e9bae4b374c476238b45",5:"edf8e9bae4b374c47631a354006d2c",6:"edf8e9c7e9c0a1d99b74c47631a354006d2c",7:"edf8e9c7e9c0a1d99b74c47641ab5d238b45005a32",8:"f7fcf5e5f5e0c7e9c0a1d99b74c47641ab5d238b45005a32",9:"f7fcf5e5f5e0c7e9c0a1d99b74c47641ab5d238b45006d2c00441b"},Oranges:{3:"fee6cefdae6be6550d",4:"feeddefdbe85fd8d3cd94701",5:"feeddefdbe85fd8d3ce6550da63603",6:"feeddefdd0a2fdae6bfd8d3ce6550da63603",7:"feeddefdd0a2fdae6bfd8d3cf16913d948018c2d04",8:"fff5ebfee6cefdd0a2fdae6bfd8d3cf16913d948018c2d04",9:"fff5ebfee6cefdd0a2fdae6bfd8d3cf16913d94801a636037f2704"},Reds:{3:"fee0d2fc9272de2d26",4:"fee5d9fcae91fb6a4acb181d",5:"fee5d9fcae91fb6a4ade2d26a50f15",6:"fee5d9fcbba1fc9272fb6a4ade2d26a50f15",7:"fee5d9fcbba1fc9272fb6a4aef3b2ccb181d99000d",8:"fff5f0fee0d2fcbba1fc9272fb6a4aef3b2ccb181d99000d",9:"fff5f0fee0d2fcbba1fc9272fb6a4aef3b2ccb181da50f1567000d"},Greys:{3:"f0f0f0bdbdbd636363",4:"f7f7f7cccccc969696525252",5:"f7f7f7cccccc969696636363252525",6:"f7f7f7d9d9d9bdbdbd969696636363252525",7:"f7f7f7d9d9d9bdbdbd969696737373525252252525",8:"fffffff0f0f0d9d9d9bdbdbd969696737373525252252525",9:"fffffff0f0f0d9d9d9bdbdbd969696737373525252252525000000"},PuOr:{3:"f1a340f7f7f7998ec3",4:"e66101fdb863b2abd25e3c99",5:"e66101fdb863f7f7f7b2abd25e3c99",6:"b35806f1a340fee0b6d8daeb998ec3542788",7:"b35806f1a340fee0b6f7f7f7d8daeb998ec3542788",8:"b35806e08214fdb863fee0b6d8daebb2abd28073ac542788",9:"b35806e08214fdb863fee0b6f7f7f7d8daebb2abd28073ac542788",10:"7f3b08b35806e08214fdb863fee0b6d8daebb2abd28073ac5427882d004b",11:"7f3b08b35806e08214fdb863fee0b6f7f7f7d8daebb2abd28073ac5427882d004b"},BrBG:{3:"d8b365f5f5f55ab4ac",4:"a6611adfc27d80cdc1018571",5:"a6611adfc27df5f5f580cdc1018571",6:"8c510ad8b365f6e8c3c7eae55ab4ac01665e",7:"8c510ad8b365f6e8c3f5f5f5c7eae55ab4ac01665e",8:"8c510abf812ddfc27df6e8c3c7eae580cdc135978f01665e",9:"8c510abf812ddfc27df6e8c3f5f5f5c7eae580cdc135978f01665e",10:"5430058c510abf812ddfc27df6e8c3c7eae580cdc135978f01665e003c30",11:"5430058c510abf812ddfc27df6e8c3f5f5f5c7eae580cdc135978f01665e003c30"},PRGn:{3:"af8dc3f7f7f77fbf7b",4:"7b3294c2a5cfa6dba0008837",5:"7b3294c2a5cff7f7f7a6dba0008837",6:"762a83af8dc3e7d4e8d9f0d37fbf7b1b7837",7:"762a83af8dc3e7d4e8f7f7f7d9f0d37fbf7b1b7837",8:"762a839970abc2a5cfe7d4e8d9f0d3a6dba05aae611b7837",9:"762a839970abc2a5cfe7d4e8f7f7f7d9f0d3a6dba05aae611b7837",10:"40004b762a839970abc2a5cfe7d4e8d9f0d3a6dba05aae611b783700441b",11:"40004b762a839970abc2a5cfe7d4e8f7f7f7d9f0d3a6dba05aae611b783700441b"},PiYG:{3:"e9a3c9f7f7f7a1d76a",4:"d01c8bf1b6dab8e1864dac26",5:"d01c8bf1b6daf7f7f7b8e1864dac26",6:"c51b7de9a3c9fde0efe6f5d0a1d76a4d9221",7:"c51b7de9a3c9fde0eff7f7f7e6f5d0a1d76a4d9221",8:"c51b7dde77aef1b6dafde0efe6f5d0b8e1867fbc414d9221",9:"c51b7dde77aef1b6dafde0eff7f7f7e6f5d0b8e1867fbc414d9221",10:"8e0152c51b7dde77aef1b6dafde0efe6f5d0b8e1867fbc414d9221276419",11:"8e0152c51b7dde77aef1b6dafde0eff7f7f7e6f5d0b8e1867fbc414d9221276419"},RdBu:{3:"ef8a62f7f7f767a9cf",4:"ca0020f4a58292c5de0571b0",5:"ca0020f4a582f7f7f792c5de0571b0",6:"b2182bef8a62fddbc7d1e5f067a9cf2166ac",7:"b2182bef8a62fddbc7f7f7f7d1e5f067a9cf2166ac",8:"b2182bd6604df4a582fddbc7d1e5f092c5de4393c32166ac",9:"b2182bd6604df4a582fddbc7f7f7f7d1e5f092c5de4393c32166ac",10:"67001fb2182bd6604df4a582fddbc7d1e5f092c5de4393c32166ac053061",11:"67001fb2182bd6604df4a582fddbc7f7f7f7d1e5f092c5de4393c32166ac053061"},RdGy:{3:"ef8a62ffffff999999",4:"ca0020f4a582bababa404040",5:"ca0020f4a582ffffffbababa404040",6:"b2182bef8a62fddbc7e0e0e09999994d4d4d",7:"b2182bef8a62fddbc7ffffffe0e0e09999994d4d4d",8:"b2182bd6604df4a582fddbc7e0e0e0bababa8787874d4d4d",9:"b2182bd6604df4a582fddbc7ffffffe0e0e0bababa8787874d4d4d",10:"67001fb2182bd6604df4a582fddbc7e0e0e0bababa8787874d4d4d1a1a1a",11:"67001fb2182bd6604df4a582fddbc7ffffffe0e0e0bababa8787874d4d4d1a1a1a"},RdYlBu:{3:"fc8d59ffffbf91bfdb",4:"d7191cfdae61abd9e92c7bb6",5:"d7191cfdae61ffffbfabd9e92c7bb6",6:"d73027fc8d59fee090e0f3f891bfdb4575b4",7:"d73027fc8d59fee090ffffbfe0f3f891bfdb4575b4",8:"d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4",9:"d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4",10:"a50026d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4313695",11:"a50026d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4313695"},Spectral:{3:"fc8d59ffffbf99d594",4:"d7191cfdae61abdda42b83ba",5:"d7191cfdae61ffffbfabdda42b83ba",6:"d53e4ffc8d59fee08be6f59899d5943288bd",7:"d53e4ffc8d59fee08bffffbfe6f59899d5943288bd",8:"d53e4ff46d43fdae61fee08be6f598abdda466c2a53288bd",9:"d53e4ff46d43fdae61fee08bffffbfe6f598abdda466c2a53288bd",10:"9e0142d53e4ff46d43fdae61fee08be6f598abdda466c2a53288bd5e4fa2",11:"9e0142d53e4ff46d43fdae61fee08bffffbfe6f598abdda466c2a53288bd5e4fa2"},RdYlGn:{3:"fc8d59ffffbf91cf60",4:"d7191cfdae61a6d96a1a9641",5:"d7191cfdae61ffffbfa6d96a1a9641",6:"d73027fc8d59fee08bd9ef8b91cf601a9850",7:"d73027fc8d59fee08bffffbfd9ef8b91cf601a9850",8:"d73027f46d43fdae61fee08bd9ef8ba6d96a66bd631a9850",9:"d73027f46d43fdae61fee08bffffbfd9ef8ba6d96a66bd631a9850",10:"a50026d73027f46d43fdae61fee08bd9ef8ba6d96a66bd631a9850006837",11:"a50026d73027f46d43fdae61fee08bffffbfd9ef8ba6d96a66bd631a9850006837"},Accent:{3:"7fc97fbeaed4fdc086",4:"7fc97fbeaed4fdc086ffff99",5:"7fc97fbeaed4fdc086ffff99386cb0",6:"7fc97fbeaed4fdc086ffff99386cb0f0027f",7:"7fc97fbeaed4fdc086ffff99386cb0f0027fbf5b17",8:"7fc97fbeaed4fdc086ffff99386cb0f0027fbf5b17666666"},Dark2:{3:"1b9e77d95f027570b3",4:"1b9e77d95f027570b3e7298a",5:"1b9e77d95f027570b3e7298a66a61e",6:"1b9e77d95f027570b3e7298a66a61ee6ab02",7:"1b9e77d95f027570b3e7298a66a61ee6ab02a6761d",8:"1b9e77d95f027570b3e7298a66a61ee6ab02a6761d666666"},Paired:{3:"a6cee31f78b4b2df8a",4:"a6cee31f78b4b2df8a33a02c",5:"a6cee31f78b4b2df8a33a02cfb9a99",6:"a6cee31f78b4b2df8a33a02cfb9a99e31a1c",7:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6f",8:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00",9:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00cab2d6",10:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00cab2d66a3d9a",11:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00cab2d66a3d9affff99",12:"a6cee31f78b4b2df8a33a02cfb9a99e31a1cfdbf6fff7f00cab2d66a3d9affff99b15928"},Pastel1:{3:"fbb4aeb3cde3ccebc5",4:"fbb4aeb3cde3ccebc5decbe4",5:"fbb4aeb3cde3ccebc5decbe4fed9a6",6:"fbb4aeb3cde3ccebc5decbe4fed9a6ffffcc",7:"fbb4aeb3cde3ccebc5decbe4fed9a6ffffcce5d8bd",8:"fbb4aeb3cde3ccebc5decbe4fed9a6ffffcce5d8bdfddaec",9:"fbb4aeb3cde3ccebc5decbe4fed9a6ffffcce5d8bdfddaecf2f2f2"},Pastel2:{3:"b3e2cdfdcdaccbd5e8",4:"b3e2cdfdcdaccbd5e8f4cae4",5:"b3e2cdfdcdaccbd5e8f4cae4e6f5c9",6:"b3e2cdfdcdaccbd5e8f4cae4e6f5c9fff2ae",7:"b3e2cdfdcdaccbd5e8f4cae4e6f5c9fff2aef1e2cc",8:"b3e2cdfdcdaccbd5e8f4cae4e6f5c9fff2aef1e2cccccccc"},Set1:{3:"e41a1c377eb84daf4a",4:"e41a1c377eb84daf4a984ea3",5:"e41a1c377eb84daf4a984ea3ff7f00",6:"e41a1c377eb84daf4a984ea3ff7f00ffff33",7:"e41a1c377eb84daf4a984ea3ff7f00ffff33a65628",8:"e41a1c377eb84daf4a984ea3ff7f00ffff33a65628f781bf",9:"e41a1c377eb84daf4a984ea3ff7f00ffff33a65628f781bf999999"},Set2:{3:"66c2a5fc8d628da0cb",4:"66c2a5fc8d628da0cbe78ac3",5:"66c2a5fc8d628da0cbe78ac3a6d854",6:"66c2a5fc8d628da0cbe78ac3a6d854ffd92f",7:"66c2a5fc8d628da0cbe78ac3a6d854ffd92fe5c494",8:"66c2a5fc8d628da0cbe78ac3a6d854ffd92fe5c494b3b3b3"},Set3:{3:"8dd3c7ffffb3bebada",4:"8dd3c7ffffb3bebadafb8072",5:"8dd3c7ffffb3bebadafb807280b1d3",6:"8dd3c7ffffb3bebadafb807280b1d3fdb462",7:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69",8:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5",9:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5d9d9d9",10:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5d9d9d9bc80bd",11:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5d9d9d9bc80bdccebc5",12:"8dd3c7ffffb3bebadafb807280b1d3fdb462b3de69fccde5d9d9d9bc80bdccebc5ffed6f"},Default:{20:"fe296c487eb6a7ce31f8cc03ff8c02699696b7784483acd0c2e076fadc5aff549fffaf549ab8b7d2a6833d699b87ac22cda908d02158d07300567676",36:"ff00000000ff00ff00ffff0000ffffff00ff993300000080808000ff6600008080660066ff99cc666699333300ffcc99ccffff9999ffff80803366ff339966ffcc0000ccffd020909933660066cc99cc00ff990033cccccc99ff800000333399008000ffffcc99ccff800080"},Basic:{24:"0000ffff004dffbf0074ff00a400ffff7400ffff0000ffffff0000ffd3003d00ff00ff00ff00ffff9200d3ff000090ff6d00ffff4900ffe80000ff92ff0090ffaa00aaff00004dff"},Light:{24:"6565ffff6593ffd865abff65c865ffffab65ffff6565ffffff6565ffe5658965ff65ff65ff65ffffbd65e5ff6565bcffa765ffff9165fff16565ffbdff65bcffcc65ccff656593ff"},Favorite:{1:"ff0000",2:"ff000000ffff",3:"ff000000ff000000ff",4:"ff000080ff0000ffff8000ff",5:"ff0000bfff0000ff800040ffff00ff",6:"ff0000ffff0000ff0000ffff0000ffff00ff",8:"ff0000ffbf0080ff0000ff4000ffff0040ff8000ffff00bf",10:"ff0000ff8000ffff0080ff0000ff0000ff8000ffff0080ff0000ff8000ff",12:"ff0000ff8000ffff0080ff0000ff0000ff8000ffff0080ff0000ff8000ffff00ffff0080",24:"ff0000ff4000ff8000ffbf00ffff00bfff0080ff0040ff0000ff0000ff4000ff8000ffbf00ffff00bfff0080ff0040ff0000ff4000ff8000ffbf00ffff00ffff00bfff0080ff0040"},Pastel:{24:"b5b5ffffb5cbffedb5d7ffb5e5b5ffffd7b5ffffb5b5ffffffb5b5fff2b5c7b5ffb5ffb5ffb5ffffdfb5f2ffb5b5dfffd5b5ffffcab5fff8b5b5ffdfffb5dfffe6b5e6ffb5b5cbff"},Balanced:{20:"fe296c487eb6a7ce31f8cc03ff8c02699696b7784483acd0c2e076fadc5aff549fffaf549ab8b7d2a6833d699b87ac22cda908d02158d07300567676"},Rpalette:{8:"000000ff000000cd000000ff00ffffff00ffffff00bebebe"},RlatticeBackground:{7:"ffe5ccccffccccffffcce6ffffccffffccccffffcc"},RlatticeShingle:{7:"ff7f0000ff0000ffff0080ffff00ffff0000ffff00"},RlatticeLine:{7:"0080ffff00ff006400ff0000ffa50000ff00a52a2a"},RlatticePolygon:{7:"ccffffffccffccffccffe5cccce6ffffffccffcccc"},Bootstrap:{1:"337ab7",2:"337ab7d9534f",3:"337ab75cb85cd9534f",4:"337ab75cb85cf0ad4ed9534f",5:"337ab75cb85c5bc0def0ad4ed9534f",6:"337ab75cb85c9370db5bc0def0ad4ed9534f",7:"337ab75cb85cd9534ff0ad4e5bc0de84fe83ff9976",8:"337ab75cb85cd9534ff0ad4e5bc0de84fe83ff9976c86727"},ColorSpectrum:{1:""},White:{1:"ffffff"},Black:{1:"000000"},NPG:{10:"e64b354dbbd500a0873c5488f39b7f8491b491d1c2dc00007e6148b09c85"},AAAS:{10:"3b4992ee0000008b45631879008280bb00215f559ba200568081801b1919"},NEJM:{8:"bc3c290072b5e1872720854e7876b16f99adffdc91ee4c97"},Lancet:{9:"00468bed000042b5400099b4925e9ffdaf91ad002aadb6b61b1919"},Jama:{7:"374e55df8f4400a1d5b2474579af976a659980796b"},JCO:{10:"0073c2efc000868686cd534c7aa6dc003c678f77003b3b3ba730304a6990"},Economist:{12:"6794a7014d6476c0c101a2d97ad2f600887dadadad7bd3f67c260bee8f7176c0c1a18376"},EconomistBG:{5:"d5e4ebc3d6dfed111aebebebc9c9c9"},Excel:{7:"ff00ffffff0000ffff8000808000000080800000ff"},Excel2:{7:"993366ffffccccffff660066ff80800066ccccccff"},Excel3:{10:"365e9698333477973d5d437c36869fd1702f8197c5c47f80acc4849887b0"},GGPlot:{1:"f8766d",2:"f8766d00bfc4",3:"f8766d00ba38619cff",4:"f8766d7cae0000bfc4c77cff",5:"f8766da3a50000bf7d00b0f6e76bf3",6:"f8766db79f0000ba3800bfc4619cfff564e3",7:"f8766dc49a0053b40000c09400b6eba58afffb61d7",8:"f8766dcd96007cae0000be6700bfc400a9ffc77cffff61cc",9:"f8766dd3920093aa0000ba3800c19f00b9e3619cffdb72fbff61c3",10:"f8766dd89000a3a50039b60000bf7d00bfc400b0f69590ffe76bf3ff62bc",11:"f8766ddb8e00aea20064b20000bd5c00c1a700bade00a6ffb385ffef67ebff63b6",12:"f8766dde8c00b79f007cae0000ba3800c08b00bfc400b4f0619cffc77cfff564e3ff64b0",13:"f8766de18a00be9c008cab0024b70000be7000c1ab00bbda00acfc8b93ffd575fef962ddff65ac",14:"f8766de38900c49a0099a80053b40000bc5600c09400bfc400b6eb06a4ffa58affdf70f8fb61d7ff66a8",15:"f8766de58700c99800a3a5006bb10000ba3800bf7d00c0af00bcd800b0f6619cffb983ffe76bf3fd61d1ff67a4",16:"f8766de68613cd9600aba3007cae000cb70200be6700c19a00bfc400b8e700a9ff8494ffc77cffed68edff61ccff68a1",17:"f8766de7851ed09400b2a10089ac0045b50000bc5100c08700c0b200bcd600b3f229a3ff9c8dffd277fff166e8ff61c7ff689e",18:"f8766de88526d39200b79f0093aa005eb30000ba3800bf7400c19f00bfc400b9e300adfa619cffae87ffdb72fbf564e3ff61c3ff699c"},Solarized:{1:"b58900",2:"b58900859900",3:"b58900c671c4859900",4:"b58900dc322f268bd2859900",5:"b58900dc322f6c71c4268bd2859900",6:"b58900cb4b16d336826c71c42aa198859900",7:"b58900cb4b16dc322f6c71c4268bd22aa198859900",8:"b58900cb4b16dc322fd336826c71c4268bd22aa198859900"},SolarizedBase:{7:"002b36073642586e7583949693a1a1eee8d5fdf6e3",8:"002b36073642586e75657b8383949693a1a1eee8d5fdf6e3"},PaulTol:{1:"4477aa",2:"4477aacc6677",3:"4477aaddcc77cc6677",4:"4477aa117733ddcc77cc6677",5:"4477aa88ccee117733ddcc77cc6677",6:"4477aa88ccee117733ddcc77cc6677aa4499",7:"33228888ccee44aa99117733ddcc77cc6677aa4499",8:"33228888ccee44aa99117733999933ddcc77cc6677aa4499",9:"33228888ccee44aa99117733999933ddcc77cc6677882255aa4499",10:"33228888ccee44aa99117733999933ddcc77661100cc6677882255aa4499",11:"3322886699cc88ccee44aa99117733999933ddcc77661100cc6677882255aa4499",12:"3322886699cc88ccee44aa99117733999933ddcc77661100cc6677aa4466882255aa4499"},ColorBlind:{8:"000000e69f0056b4e9009e73f0e4420072b2d55e00cc79a7"},Tableau:{20:"1f77b4aec7e8ff7f0effbb782ca02c98df8ad62728ff98969467bdc5b0d58c564bc49c94e377c2f7b6d27f7f7fc7c7c7bcbd22dbdb8d17becf9edae5",10:"1f77b4ff7f0e2ca02cd627289467bd8c564be377c27f7f7fbcbd2217becf"},TableauMedium:{10:"729eceff9e4a67bf5ced665dad8bc9a8786eed97caa2a2a2cdcc5d6dccda"},TableauLight:{10:"aec7e8ffbb7898df8aff9896c5b0d5c49c94f7b6d2c7c7c7dbdb8d9edae5"},TableauGrey:{5:"60636aa5acaf4144518f8782cfcfcf"},TableauColorBlind:{10:"006ba4ff800eababab5959595f9ed1c85200898989a2c8ecffbc79cfcfcf"},TableauTrafficLight:{9:"b10318dba13a309343d82526ffc15669b764f26c64ffdd719fcd99"},TableauPurpleGrey:{12:"7b66d2a699e8dc5fbdffc0da5f5a41b4b19b995688d898baab6ad5d098ee8b7c6edbd4c5"},TableauBlueRed:{12:"2c69b0b5c8e2f02720ffb6b0ac613ce9c39b6ba3d6b5dffdac8763ddc9b4bd0a36f4737a"},TableauGreenOrange:{12:"32a251acd98dff7f0fffb9773cb7cc98d9e4b85a0dffd94a39737c86b4a982853bccc94d"},TableauCyclic:{20:"1f83b41696ac18a18829a03c54a33882a93fadb828d8bd35ffbd4cffb022ff9c0eff810ee75727d23e4ec94d8cc04aa7b446b39658b18061b46f63bb"},TableauPairSequential:{32:"bccfb49c0824bccfb409622ab4d4da26456ef0c2947b3014c3c3c31e1e1ee5e5e5ffb2b6e5e5e5b7e6a7e5e5e5c4d8f3e5e5e5ffcc9ef5cac7bd1100dbe8b43c8200f3e0c2bb5137feffd941b7c4f7e4c6bb5137efedf5807dbaf0f0f0737373"},TableauTripleDiverging:{48:"9c0824cacaca26456e9c0824cacaca09622a9c0824ffffff09622a9c0824cacaca1e1e1e9c0824ffffff1e1e1e09622acacaca26456e7b3014cacaca26456e7b3014ffffff26456effb2b6e5e5e5b7e6a7ffb2b6ffffffb7e6a7ffb2b6ffffffc6c6c6ffcc9ee5e5e5c4d8f3ffcc9effffffc4d8f3e0ad30e4e4e27492aaeda389cde1d35c8b70529985dbcf47c26b51"},WallStreetJournal:{4:"efefefe9f3ead4dee7f8f2e4"},WallStreetJournal2:{4:"d3ba68d5695d5d8ca865a479"},WallStreetJournalRedGreen:{2:"088158ba2f2a"},WallStreetJournalBlackGreen:{4:"00000059595959a77f008856"},WallStreetJournalDemRep:{3:"006a8eb1283aa8a6a7"},WallStreetJournal3:{6:"c72e29016392be9c2e098154fb832d000000"},Stata:{15:"1a476f90353b55752fe37e006e8e84c10534938dd2cac27ea0522d7b92a82d6d669c8847bfa19cffd200d9e6eb"},Stata2:{15:"ffff0000ff000080ffff00ffff7f00ff0000add8e6ffe47400ff80c0dcc0ff45000000ffff00806e8e84a0522d"},Stata3:{15:"006000ff45001a476f90353b6e8e84a0522dff7f00ff00ff00ffffff000000ff009c8847800080c0dcc0add8e6"},StataMono:{15:"606060a0a0a0808080404040000000e0e0e0202020707070909090b0b0b0d0d0d0f0f0f0303030c0c0c0505050"},BlackAndWhite:{3:"f0f0f0bdbdbd636363",4:"f7f7f7cccccc969696525252",5:"f7f7f7cccccc969696636363252525",6:"f7f7f7d9d9d9bdbdbd969696636363252525",7:"f7f7f7d9d9d9bdbdbd969696737373525252252525",8:"fffffff0f0f0d9d9d9bdbdbd969696737373525252252525",9:"fffffff0f0f0d9d9d9bdbdbd969696737373525252252525000000"},CanvasXpress:{1:"4575b4",2:"d730274575b4",3:"d7191cfdae612c7bb6",4:"d7191cfdae61abd9e92c7bb6",5:"d7191cfdae61ffffbfabd9e92c7bb6",6:"d73027fc8d59fee090e0f3f891bfdb4575b4",7:"d73027fc8d59fee090ffffbfe0f3f891bfdb4575b4",8:"d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4",9:"d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4",10:"a50026d73027f46d43fdae61fee090e0f3f8abd9e974add14575b4313695",11:"a50026d73027f46d43fdae61fee090ffffbfe0f3f8abd9e974add14575b4313695"},CanvasXpressTraditional:{1:"f2000d",2:"f2000d000df2",3:"f2000d000df20df200",4:"f2000d000df20df200f2f20d",5:"f2000d000df20df200f2f20df20df2",6:"f2000d000df20df200f2f20df20df20df2f2",7:"f2000d000df20df200f2f20df20df20df2f2f2f2f2",8:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd3",9:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fe",10:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b",11:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d0016",12:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d",13:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00",14:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00080808",15:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00080808fed38b",16:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00080808fed38bd38bfe",17:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00080808fed38bd38bfe8bfed3",18:"f2000d000df20df200f2f20df20df20df2f2f2f2f2fe8bd38bd3fed3fe8b5d001600165d165d00080808fed38bd38bfe8bfed3404040"},Matlab:{7:"0072bdd95319edb1207e2f8e77ac304dbeeea2142f"},Parula:{10:"352a870f5cdd127dd8079ccf15b1b459bd8ca5be6be1b952fcce2ef9fb0e"},Viridis:{3:"44015421908cfde725",4:"44015431688e35b779fde725",5:"4401543b528b21908c5dc863fde725",6:"4401544144872a788e22a8847ad151fde725",7:"440154443a8331688e21908c35b7798fd744fde725",8:"44015446337e365c8d277f8e1fa1874ac16d9fda3afde725",9:"440154472d7b3b528b2c728e21908c27ad815dc863aadc32fde725",10:"4401544828783e4a8931688e26828e1f9e8935b7796dcd59b4de2cfde725",11:"44015448257641448735608d2a788e21908c22a88443bf717ad151bbdf27fde725",12:"440154482173433e8538598c2d708e25858e1e9b8a2bb07f51c56a85d54ac2df23fde725"},Magma:{3:"000004b63679fcfdbf",4:"000004721f81f1605dfcfdbf",5:"00000451127cb63679fb8861fcfdbf",6:"0000043b0f708c2981de4968fe9f6dfcfdbf",7:"0000042d1160721f81b63679f1605dfeaf77fcfdbf",8:"0000042311515f187f982d80d3436ef8765cfeba80fcfdbf",9:"0000041d114751127c822681b63679e65164fb8861fec287fcfdbf",10:"000004180f3e451077721f819f2f7fcd4071f1605dfd9567fec98dfcfdbf",11:"000004150e373b0f70641a808c2981b63679de4968f76f5cfe9f6dfece91fcfdbf",12:"000004120d323310685a167e7d2482a3307ec83e73e95562f97c5dfea873fed395fcfdbf"},Plasma:{3:"0d0887cc4678f0f921",4:"0d08879c179eed7953f0f921",5:"0d08877e03a8cc4678f89441f0f921",6:"0d08876a00a8b12a90e16462fca636f0f921",7:"0d08875d01a69c179ecc4678ed7953fdb32ff0f921",8:"0d08875402a38b0aa5b93289db5c68f48849febc2af0f921",9:"0d08874c02a17e03a8a92395cc4678e56b5df89441fdc328f0f921",10:"0d088747039f7301a89c179ebd3786d8576bed7953fa9e3bfdc926f0f921",11:"0d088742049e6a00a8900da4b12a90cc4678e16462f1844bfca636fcce25f0f921",12:"0d08873e049c6300a78707a6a62098c03a83d5546ee76f5af58c46fdad32fcd225f0f921"},Inferno:{3:"000004bb3754fcffa4",4:"000004781c6ded6925fcffa4",5:"00000456106ebb3754f98c0afcffa4",6:"000004420a68932667dd513afca50afcffa4",7:"000004330a5f781c6dbb3754ed6925fcb519fcffa4",8:"000004280b5465156e9f2a63d44842f57d15fac127fcffa4",9:"000004210c4a56106e89226abb3754e35932f98c0af9c932fcffa4",10:"0000041b0c424b0c6b781c6da52c60cf4446ed6925fb9a06f7d03cfcffa4",11:"000004170c3a420a686b186e932667bb3754dd513af3771afca50af6d645fcffa4",12:"000004140b353a096360136e85216ba92e5ecb4149e65d2ff78311fcad12f5db4bfcffa4"},Cividis:{3:"00204d7c7b78ffea46",4:"00204d575c6da69d75ffea46",5:"00204d414d6b7c7b78bcaf6fffea46",6:"00204d31446b666970958f78cbba69ffea46",7:"00204d233e6c575c6d7c7b78a69d75d3c164ffea46",8:"00204d16396d4b546c6c6e728e8a79b3a772dbc761ffea46",9:"00204d05366e414d6b61646f7c7b789b9477bcaf6fe0cb5effea46",10:"00204d00336f39486b575c6d7071738a8779a69d75c4b56ce4cf5bffea46",11:"00204d00326f31446b4e576c6669707c7b78958f78b0a473cbba69e7d159ffea46",12:"00204d00306f2a406c48526b5e626e7273748784799e9677b6a971d0be67ead357ffea46"},Rainbow:{3:"ff000000ff000000ff",4:"ff000080ff0000ffff8000ff",5:"ff0000ccff0000ff660066ffcc00ff",6:"ff0000ffff0000ff0000ffff0000ffff00ff",7:"ff0000ffdb0049ff0000ff920092ff4900ffff00db",8:"ff0000ffbf0080ff0000ff4000ffff0040ff8000ffff00bf",9:"ff0000ffaa00aaff0000ff0000ffaa00aaff0000ffaa00ffff00aa",10:"ff0000ff9900ccff0033ff0000ff6600ffff0066ff3300ffcc00ffff0099",11:"ff0000ff8b00e8ff005dff0000ff2e00ffb900b9ff002eff5d00ffe800ffff008b",12:"ff0000ff8000ffff0080ff0000ff0000ff8000ffff0080ff0000ff8000ffff00ffff0080"},Heat:{3:"ff0000ff8000ffff00",4:"ff0000ff8000ffff00ffff80",5:"ff0000ff5500ffaa00ffff00ffff80",6:"ff0000ff4000ff8000ffbf00ffff00ffff80",7:"ff0000ff3300ff6600ff9900ffcc00ffff00ffff80",8:"ff0000ff3300ff6600ff9900ffcc00ffff00ffff40ffffbf",9:"ff0000ff2a00ff5500ff8000ffaa00ffd500ffff00ffff40ffffbf",10:"ff0000ff2400ff4900ff6d00ff9200ffb600ffdb00ffff00ffff40ffffbf",11:"ff0000ff2000ff4000ff6000ff8000ff9f00ffbf00ffdf00ffff00ffff40ffffbf",12:"ff0000ff2000ff4000ff6000ff8000ff9f00ffbf00ffdf00ffff00ffff2affff80ffffd5"}};for(var c in CanvasXpress.colorSchemes){for(var d in CanvasXpress.colorSchemes[c]){var b=CanvasXpress.colorSchemes[c][d].match(/.{6}/g);CanvasXpress.colorSchemes[c][d]=b?b.map(function(a){return"#"+a}):[]}}}();CanvasXpress.ambiguityCodes={"-":["-"],A:["A"],C:["C"],G:["G"],T:["T"],M:["A","C"],R:["A","G"],W:["A","T"],S:["C","G"],Y:["C","T"],K:["G","T"],V:["A","C","G"],H:["A","C","T"],D:["A","G","T"],B:["C","G","T"],N:["A","C","G","T"],X:["A","C","G","T"]};CanvasXpress.codon={TTT:["F","Phe","Phenylalanine"],TCT:["S","Ser","Serine"],TAT:["Y","Tyr","Tyrosine"],TGT:["C","Cys","Cysteine"],TTC:["F","Phe","Phenylalanine"],TCC:["S","Ser","Serine"],TAC:["Y","Tyr","Tyrosine"],TGC:["C","Cys","Cysteine"],TTA:["L","Leu","Leucine"],TCA:["S","Ser","Serine"],TAA:["*","Stop","Ochre"],TGA:["*","Stop","Opal"],TTG:["L","Leu","Leucine"],TCG:["S","Ser","Serine"],TAG:["*","Stop","Amber"],TGG:["W","Trp","Tryptophan"],CTT:["L","Leu","Leucine"],CCT:["P","Pro","Proline"],CAT:["H","His","Histidine"],CGT:["R","Arg","Arginine"],CTC:["L","Leu","Leucine"],CCC:["P","Pro","Proline"],CAC:["H","His","Histidine"],CGC:["R","Arg","Arginine"],CTA:["L","Leu","Leucine"],CCA:["P","Pro","Proline"],CAA:["Q","Gln","Glutamine"],CGA:["R","Arg","Arginine"],CTG:["L","Leu","Leucine"],CCG:["P","Pro","Proline"],CAG:["Q","Gln","Glutamine"],CGG:["R","Arg","Arginine"],ATT:["I","Ile","Isoleucine"],ACT:["T","Thr","Threonine"],AAT:["N","Asn","Asparagine"],AGT:["S","Ser","Serine"],ATC:["I","Ile","Isoleucine"],ACC:["T","Thr","Threonine"],AAC:["N","Asn","Asparagine"],AGC:["S","Ser","Serine"],ATA:["I","Ile","Isoleucine"],ACA:["T","Thr","Threonine"],AAA:["K","Lys","Lysine"],AGA:["R","Arg","Arginine"],ATG:["M","Met","Methionine"],ACG:["T","Thr","Threonine"],AAG:["K","Lys","Lysine"],AGG:["R","Arg","Arginine"],GTT:["V","Val","Valine"],GCT:["A","Ala","Alanine"],GAT:["D","Asp","Aspartic acid"],GGT:["G","Gly","Glycine"],GTC:["V","Val","Valine"],GCC:["A","Ala","Alanine"],GAC:["D","Asp","Aspartic acid"],GGC:["G","Gly","Glycine"],GTA:["V","Val","Valine"],GCA:["A","Ala","Alanine"],GAA:["E","Glu","Glutamic acid"],GGA:["G","Gly","Glycine"],GTG:["V","Val","Valine"],GCG:["A","Ala","Alanine"],GAG:["E","Glu","Glutamic acid"],GGG:["G","Gly","Glycine"]};CanvasXpress.reverseComplement={A:"T",C:"G",G:"C",T:"A",U:"A",Y:"R",R:"Y",W:"W",S:"S",K:"M",M:"K",B:"V",V:"B",D:"H",H:"D",X:"X",N:"N",a:"t",c:"g",g:"c",t:"a",u:"a",y:"r",r:"y",w:"w",s:"s",k:"m",m:"k",b:"v",v:"b",d:"h",h:"d",x:"x",n:"n"," ":" ","-":"-","/":"/","[":"[","]":"]"};CanvasXpress.themes={economist:{backgroundType:"solid",backgroundWindow:"#D5E4EB",background:"#D5E4EB",colorScheme:"Economist",legendColor:"#000000",legendBox:false,legendBoxColor:"#000000",legendBackgroundColor:"#D5E4EB",legendColumns:4,legendInside:true,legendPosition:"top",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:2,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:false,xAxisTickColor:"#000000",xAxisLeftMajorTick:false,xAxisRightMajorTick:false,xAxisTickStyle:"line",xAxisLeftRightTickColor:"#000000",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:false,yAxis2Show:true,yAxisTickStyle:"line",yAxisTickColor:"#FFFFFF",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#000000",titleAlign:"left",titleColor:"#000000",subtitleAlign:"left",subtitleColor:"#000000",conditional:{OneDPlots:{xAxisMajorTicks:true}}},excel:{backgroundType:"window",backgroundWindow:"#C0C0C0",background:"#FFFFFF",colorScheme:"Excel",legendColor:"#000000",legendBox:true,legendBoxColor:"#000000",legendBackgroundColor:"#FFFFFF",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:false,xAxisTickColor:"#000000",xAxisLeftMajorTick:true,xAxisRightMajorTick:true,xAxisTickStyle:"line",xAxisLeftRightTickColor:"#000000",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#000000",yAxisTopMajorTick:true,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#000000",titleAlign:"left",titleColor:"#000000",subtitleAlign:"left",subtitleColor:"#000000",conditional:{OneDPlots:{xAxisMajorTicks:true}}},tableau:{backgroundType:"window",backgroundWindow:"#FFFFFF",background:"#E5E5E5",colorScheme:"TableauMedium",legendColor:"#000000",legendBox:true,legendBoxColor:"#E5E5E5",legendBackgroundColor:"#FFFFFF",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#E5E5E5",xAxisLeftMajorTick:true,xAxisRightMajorTick:true,xAxisLeftRightTickColor:"#E5E5E5",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#E5E5E5",yAxisTopMajorTick:true,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#E5E5E5",titleAlign:"left",titleColor:"#000000",subtitleAlign:"left",subtitleColor:"#000000"},stata:{backgroundType:"window",backgroundWindow:"#FFFFFF",background:"#EAF2F3",colorScheme:"Stata",legendColor:"#000000",legendBox:true,legendBoxColor:"#000000",legendBackgroundColor:"#FFFFFF",legendColumns:4,legendInside:false,legendPosition:"bottom",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:2,xAxisMinorTicks:false,xAxisMajorTicks:false,xAxisTickStyle:"line",xAxisTickColor:"#000000",xAxisLeftMajorTick:true,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#000000",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#EAF2F3",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#000000",titleAlign:"center",titleColor:"#000000",subtitleAlign:"center",subtitleColor:"#000000",conditional:{OneDPlots:{xAxisMajorTicks:true}}},igray:{backgroundType:"window",backgroundWindow:"#FFFFFF",background:"#E5E5E5",colorScheme:"GGPlot",legendColor:"#000000",legendBox:false,legendBoxColor:"#000000",legendBackgroundColor:"#FFFFFF",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#E5E5E5",xAxisLeftMajorTick:false,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#000000",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#E5E5E5",yAxisTopMajorTick:false,yAxisBottomMajorTick:false,yAxisTopBottomTickColor:"#000000",titleAlign:"center",titleColor:"#000000",subtitleAlign:"center",subtitleColor:"#000000"},solarized:{backgroundType:"solid",backgroundWindow:"#FDF6E3",background:"#FDF6E3",colorScheme:"Solarized",legendColor:"#93A1A1",legendBox:true,legendBoxColor:"#93A1A1",legendBackgroundColor:"#FFFFFF",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#93A1A1",axisTitleColor:"#93A1A1",axisTickThickness:1,axisMinMaxTickThickness:2,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#93A1A1",xAxisLeftMajorTick:true,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#93A1A1",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#93A1A1",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#93A1A1",titleAlign:"left",titleColor:"#93A1A1",subtitleAlign:"left",subtitleColor:"#93A1A1"},paulTol:{backgroundType:"solid",backgroundWindow:"#FFFFFF",background:"#FFFFFF",colorScheme:"PaulTol",legendColor:"#000000",legendBox:false,legendBoxColor:"#000000",legendBackgroundColor:"#FFFFFF",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#E5E5E5",xAxisLeftMajorTick:false,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#E5E5E5",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#E5E5E5",yAxisTopMajorTick:false,yAxisBottomMajorTick:false,yAxisTopBottomTickColor:"#E5E5E5",titleAlign:"left",titleColor:"#000000",subtitleAlign:"left",subtitleColor:"#000000"},ggplot:{backgroundType:"window",backgroundWindow:"#E5E5E5",background:"#FFFFFF",colorScheme:"GGPlot",legendColor:"#000000",legendBox:true,legendBoxColor:"#FFFFFF",legendBackgroundColor:"#E5E5E5",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#FFFFFF",xAxisLeftMajorTick:true,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#FFFFFF",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#FFFFFF",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#FFFFFF",titleAlign:"center",titleColor:"#000000",subtitleAlign:"center",subtitleColor:"#000000"},wallStreetJournal:{backgroundType:"solid",backgroundWindow:"#F8F2E4",background:"#F8F2E4",colorScheme:"WallStreetJournal3",legendColor:"#000000",legendBox:false,legendBoxColor:"#000000",legendBackgroundColor:"#F8F2E4",legendColumns:4,legendInside:true,legendPosition:"top",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:2,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:false,xAxisTickStyle:"dotted",xAxisTickColor:"#000000",xAxisLeftMajorTick:false,xAxisRightMajorTick:false,xAxisLeftRightTickColor:"#000000",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"dotted",yAxisTickColor:"#000000",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#000000",titleAlign:"left",titleColor:"#000000",subtitleAlign:"left",subtitleColor:"#000000",conditional:{OneDPlots:{xAxisMajorTicks:true}}},cx:{backgroundType:"window",backgroundWindow:"#E8E8E8",background:"#FFFFFF",colorScheme:"CanvasXpress",legendColor:"#000000",legendBox:true,legendBoxColor:"#FFFFFF",legendBackgroundColor:"#E8E8E8",axisTickColor:"#000000",axisTitleColor:"#000000",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:false,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"#FFFFFF",xAxisLeftMajorTick:true,xAxisRightMajorTick:true,xAxisLeftRightTickColor:"#337AB7",yAxisMajorTicks:true,yAxisMinorTicks:false,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"#FFFFFF",yAxisTopMajorTick:true,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"#337AB7",titleAlign:"center",titleColor:"#000000",subtitleAlign:"center",subtitleColor:"#000000"},none:{backgroundType:"solid",backgroundWindow:"rgb(244,244,244)",background:"rgb(255,255,255)",colorScheme:"User",colors:CanvasXpress.colorSchemes.Default[20],legendColor:"rgb(0,0,0)",legendBox:true,legendBoxColor:"rgb(204,204,204)",legendBackgroundColor:"rgb(255,255,255)",legendColumns:1,legendInside:false,legendPosition:"right",legendScaleFontFactor:1,axisTickScaleFontFactor:1,axisTitleScaleFontFactor:1,axisTickColor:"rgb(0,0,0)",axisTitleColor:"rgb(0,0,0)",axisTickThickness:1,axisMinMaxTickThickness:1,xAxisMinorTicks:true,xAxisMajorTicks:true,xAxisTickStyle:"line",xAxisTickColor:"rgb(204,204,204)",xAxisLeftMajorTick:true,xAxisRightMajorTick:true,xAxisLeftRightTickColor:"rgb(204,204,204)",yAxisMajorTicks:true,yAxisMinorTicks:true,yAxisShow:true,yAxis2Show:false,yAxisTickStyle:"line",yAxisTickColor:"rgb(204,204,204)",yAxisTopMajorTick:false,yAxisBottomMajorTick:true,yAxisTopBottomTickColor:"rgb(204,204,204)",titleAlign:"center",titleColor:"rgb(0,0,0)",subtitleAlign:"center",subtitleColor:"rgb(0,0,0)"}};CanvasXpress.themes.CanvasXpress=CanvasXpress.themes.cx;CanvasXpress.themes.canvasXpress=CanvasXpress.themes.cx;CanvasXpress.themes.canvasxpress=CanvasXpress.themes.cx;CanvasXpress.R={lty:[[0,0],[],[8,6],[1,3],[1,3,5,3],[14,6],[4,3,8,3]],ltyNames:["blank","solid","dashed","dotted","dotdash","longdash","twodash"]};CanvasXpress.prototype.initDOM=function(){this.$=function(id){return window.document.getElementById(id)};this.$cX=function(t,p,s){var e;e=window.document.createElement(t);if(p){for(var i in p){e[i]=p[i]}}if(s){for(var i in s){e.style[i]=s[i]}}return e};this.setPixelImage=function(){if(CanvasXpress.instances.length==1){this.beaconImage=this.$cX("img",{id:this.target+"-cX-Beacon-Image",src:(window.navigator.onLine?"https://www.canvasxpress.org/assets/images/beacon.gif?"+CanvasXpress.factory.client:CanvasXpress.images.canvasXpress)})}else{this.beaconImage=CanvasXpress.instances[0].beaconImage}};this.createNewTarget=function(){var cn=this.$cX("canvas").setAttribute("id",this.newId("canvasXpress"));window.document.body.appendChild(cn);return cn.id};this.newId=function(t){var n=0;var i=this.target+t+n;while(this.meta.ids[i]){n++;i=this.target+t+n}this.meta.ids[i]=true;return i};this.insertTarget=function(t,p,w,h,a){if(t&&p){var c=this.$(t);if(c){return}else{c=this.$cX("canvas",{id:t,width:w,height:h});this.castCanvasAttributes(c)}if(a){p.parentNode.insertBefore(c,p.nextSibling)}else{p.parentNode.insertBefore(c,p)}}};this.castCanvasAttributes=function(c,e){if(!e){e=this.meta.canvas.ctx.canvas}CanvasXpress.transferDatasetAttributes(c,e)};this.removeTarget=function(t){var n=this.$(t);if(n){n.parentNode.removeChild(n)}};this.getWindowSize=function(){var doc=window.document;var w=window.innerWidth||doc.documentElement.clientWidth||doc.body.clientWidth;var h=window.innerHeight||doc.documentElement.clientHeight||doc.body.clientHeight;return[w,h]};this.getWindowScroll=function(){var d=window.document.documentElement;var l=(window.pageXOffset||d.scrollLeft)-(d.clientLeft||0);var t=(window.pageYOffset||d.scrollTop)-(d.clientTop||0);return[l,t]};this.isInViewport=function(el,d){var w=this.getWindowSize();var b=el.getBoundingClientRect();var c=b.right-(this.width*0.5);var m=b.bottom-(this.height*0.5);return b.left>=0&&b.top>=0&&c<=w[0]&&m<=w[1]};this.hasClass=function(e,n){return e.classList.contains(n)};this.addClass=function(e,n){e.classList.add(n)};this.removeClass=function(e,n){e.classList.remove(n)};this.getComputedCSS=function(e){var s="";var o=getComputedStyle(e);for(var i=0;i<o.length;i++){s+=o[i]+":"+o.getPropertyValue(o[i])+";"}return s};this.cancelEvent=function(e){if(!e){return}if(CanvasXpress.system.browser.match(/safari/i)){return false}else{if(e.preventDefault){e.preventDefault()}else{e.returnValue=false}}};this.stopEvent=function(e){if(!e){return}if(e.stopPropagation){e.stopPropagation()}else{e.cancelBubble=true}};this.normalizeEvtName=function(e){return CanvasXpress.system.isIE?"on"+e:e};this.copyEvent=function(e){var ce={};for(var i in e){ce[i]=e[i]}return ce};this.addEvtListener=function(o,e,c,f){if(o&&(typeof o)=="string"){o=this.$(o)}if(o&&e&&c){var m=this.meta.events;if(o.id){if(!m[o.id]){m[o.id]={}}m[o.id][e]=[c,f]}else{if(!m[o]){m[o]={}}m[o][e]=[c,f]}if(CanvasXpress.system.isIE){o.attachEvent(this.normalizeEvtName(e),c)}else{if(e=="touchstart"){o.addEventListener(e,c,f)}else{if(e=="mousewheel"){o.addEventListener(e,c,f);o.addEventListener("DOMMouseScroll",c,f)}else{o.addEventListener(e,c,f)}}}}};this.removeEvtListener=function(o,e,c,f){if(o&&(typeof o)=="string"){o=this.$(o)}if(o&&e&&c){var m=this.meta.events;var k=m[o.id||o];if(k&&k.hasOwnProperty(e)){delete (k[e]);if(CanvasXpress.system.isIE){o.detachEvent(this.normalizeEvtName(e),c)}else{o.removeEventListener(e,c,f);if(e=="mousewheel"){o.removeEventListener("DOMMouseScroll",c,f)}}var v=this.getKeys(m[o.id||o]);if(v&&v.length<1){delete (m[o.id||o])}}}};this.addRemoveEvtListener=function(t,o,e,c,f){if(t&&o&&e&&c){this[t](o,e,c,f)}};this.purgeEventListeners=function(){var m=this.meta.events;for(var i in m){var o=this.$(i)||i;for(var e in m[i]){this.removeEvtListener(o,e,m[i][0],m[i][1])}}};this.preventSelection=function(){var d=window.document;if(d.selection){d.selection.empty()}else{if(window.getSelection){window.getSelection().removeAllRanges()}}};this.getTargetEvent=function(e){var obj=e.target||e.srcElement;if(typeof(obj)!="object"){obj=this.$(obj)}return obj};this.dispatchEvent=function(el,e){el.dispatchEvent(e)};this.requestAnimationFrame=function(callback,time){if(callback){raf=window.requestAnimationFrame||window.webkitRequestAnimationFrame||window.mozRequestAnimationFrame||window.oRequestAnimationFrame||window.msRequestAnimationFrame;if(raf){raf(callback)}else{if(!time){time=1000/60}window.setTimeout(callback,time)}}};this.setTimeout=function(callback,time){if(this.isR){setTimeout(callback,time)}else{var that=this;var wait=function(t){return new Promise(function(resolve,reject){if(t){setTimeout(resolve,t)}else{setTimeout(resolve,1000)}})};wait(time).then(function(){callback.apply(that)})}};this.setInterval=function(c,d){this.logConsole("canvasXpress setInterval ready - "+arguments.callee.caller.name+" - "+d);return setInterval(c,d)};if(typeof JSON.decycle!=="function"){JSON.decycle=function decycle(object,replacer){var objects=new WeakMap();return(function derez(value,path){var old_path;var nu;if(replacer!==undefined){value=replacer(value)}if(typeof value==="object"&&value!==null&&!(value instanceof Boolean)&&!(value instanceof Date)&&!(value instanceof Number)&&!(value instanceof RegExp)&&!(value instanceof String)){old_path=objects.get(value);if(old_path!==undefined){return{$ref:old_path}}objects.set(value,path);if(Array.isArray(value)){nu=[];value.forEach(function(element,i){nu[i]=derez(element,path+"["+i+"]")})}else{nu={};Object.keys(value).forEach(function(name){nu[name]=derez(value[name],path+"["+JSON.stringify(name)+"]")})}return nu}return value}(object,"$"))}}if(typeof JSON.retrocycle!=="function"){JSON.retrocycle=function retrocycle($){var px=/^\$(?:\[(?:\d+|"(?:[^\\"\u0000-\u001f]|\\([\\"\/bfnrt]|u[0-9a-zA-Z]{4}))*")\])*$/;(function rez(value){if(value&&typeof value==="object"){if(Array.isArray(value)){value.forEach(function(element,i){if(typeof element==="object"&&element!==null){var path=element.$ref;if(typeof path==="string"&&px.test(path)){value[i]=eval(path)}else{rez(element)}}})}else{Object.keys(value).forEach(function(name){var item=value[name];if(typeof item==="object"&&item!==null){var path=item.$ref;if(typeof path==="string"&&px.test(path)){value[name]=eval(path)}else{rez(item)}}})}}}($));return $}}if(!Array.from){Array.from=(function(){var toStr=Object.prototype.toString;var isCallable=function(fn){return typeof fn==="function"||toStr.call(fn)==="[object Function]"};var toInteger=function(value){var number=Number(value);if(isNaN(number)){return 0}if(number===0||!isFinite(number)){return number}return(number>0?1:-1)*Math.floor(Math.abs(number))};var maxSafeInteger=Math.pow(2,53)-1;var toLength=function(value){var len=toInteger(value);return Math.min(Math.max(len,0),maxSafeInteger)};return function from(arrayLike){var C=this;var items=Object(arrayLike);if(arrayLike==null){throw new TypeError("Array.from requires an array-like object - not null or undefined")}var mapFn=arguments.length>1?arguments[1]:void undefined;var T;if(typeof mapFn!=="undefined"){if(!isCallable(mapFn)){throw new TypeError("Array.from: when provided, the second argument must be a function")}if(arguments.length>2){T=arguments[2]}}var len=toLength(items.length);var A=isCallable(C)?Object(new C(len)):new Array(len);var k=0;var kValue;while(k<len){kValue=items[k];if(mapFn){A[k]=typeof T==="undefined"?mapFn(kValue,k):mapFn.call(T,kValue,k)}else{A[k]=kValue}k+=1}A.length=len;return A}}())}if(!Array.prototype.fill){Object.defineProperty(Array.prototype,"fill",{value:function(value){if(this==null){throw new TypeError("this is null or not defined")}var O=Object(this);var len=O.length>>>0;var start=arguments[1];var relativeStart=start>>0;var k=relativeStart<0?Math.max(len+relativeStart,0):Math.min(relativeStart,len);var end=arguments[2];var relativeEnd=end===undefined?len:end>>0;var finl=relativeEnd<0?Math.max(len+relativeEnd,0):Math.min(relativeEnd,len);while(k<finl){O[k]=value;k++}return O}})}if(typeof Object.assign!="function"){Object.defineProperty(Object,"assign",{value:function assign(target,varArgs){if(target==null){throw new TypeError("Cannot convert undefined or null to object")}var to=Object(target);for(var index=1;index<arguments.length;index++){var nextSource=arguments[index];if(nextSource!=null){for(var nextKey in nextSource){if(Object.prototype.hasOwnProperty.call(nextSource,nextKey)){to[nextKey]=nextSource[nextKey]}}}}return to},writable:true,configurable:true})}if(!Array.prototype.map){Array.prototype.map=function(callback){var T,A,k;if(this==null){throw new TypeError("this is null or not defined")}var O=Object(this);var len=O.length>>>0;if(typeof callback!=="function"){throw new TypeError(callback+" is not a function")}if(arguments.length>1){T=arguments[1]}A=new Array(len);k=0;while(k<len){var kValue,mappedValue;if(k in O){kValue=O[k];mappedValue=callback.call(T,kValue,k,O);A[k]=mappedValue}k++}return A}}if(!Array.prototype.findIndex){Object.defineProperty(Array.prototype,"findIndex",{value:function(predicate){if(this==null){throw new TypeError('"this" is null or not defined')}var o=Object(this);var len=o.length>>>0;if(typeof predicate!=="function"){throw new TypeError("predicate must be a function")}var thisArg=arguments[1];var k=0;while(k<len){var kValue=o[k];if(predicate.call(thisArg,kValue,k,o)){return k}k++}return -1}})}if(typeof window.CustomEvent!=="function"){window.CustomEvent=function(event,params){params=params||{bubbles:false,cancelable:false,detail:null};var evt=document.createEvent("CustomEvent");evt.initCustomEvent(event,params.bubbles,params.cancelable,params.detail);return evt}}this.isInIframe=function(){try{return window.self!==window.top}catch(e){return true}};this.initializeBrowser=function(){var getBrowserVersion=function(){var ua=window.navigator.userAgent;var tem;var m=ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i)||[];if(/trident/i.test(m[1])){tem=/\brv[ :]+(\d+)/g.exec(ua)||[];return"IE "+(tem[1]||"")}if(m[1]==="Chrome"){tem=ua.match(/\b(OPR|Edge)\/(\d+)/);if(tem!=null){return tem.slice(1).join(" ").replace("OPR","Opera")}}m=m[2]?[m[1],m[2]]:[window.navigator.appName,window.navigator.appVersion,"-?"];if((tem=ua.match(/version\/(\d+)/i))!=null){m.splice(1,1,tem[1])}return m.join(" ")};var getOS=function(){var userAgent=window.navigator.userAgent;var platform=window.navigator.platform;var macosPlatforms=["Macintosh","MacIntel","MacPPC","Mac68K"];var windowsPlatforms=["Win32","Win64","Windows","WinCE"];var iosPlatforms=["iPhone","iPad","iPod"];var os=null;if(macosPlatforms.indexOf(platform)!==-1){os="Mac OS"}else{if(iosPlatforms.indexOf(platform)!==-1){os="iOS"}else{if(windowsPlatforms.indexOf(platform)!==-1){os="Windows"}else{if(/Android/.test(userAgent)){os="Android"}else{if(!os&&/Linux/.test(platform)){os="Linux"}}}}}return os};var str=getBrowserVersion().split(" ");var os=getOS();CanvasXpress.system={browser:str[0],browserVersion:str[1],os:os,alt:(os=="Mac OS"?"&#8997;":"Alt"),command:"&#8984;",control:(os=="Mac OS"?"&#8963;":"Ctrl"),shift:(os=="Mac OS"?"&#8679;":"Shift"),isjQuery:typeof $==="function",isReveal:typeof Reveal!="undefined",isZoom:typeof zoom!="undefined",isIE:this.browser=="IE"?true:false,isInIframe:(str[0].match(/safari/i)?true:this.isInIframe()),isTouchScreen:("ontouchstart" in window||"onmsgesturechange" in window||window.navigator.maxTouchPoints)}};this.setFunctionNames("initDOM");this.initializeBrowser()};CanvasXpress.prototype.initSVG=function(){
/*!!
   *  Canvas 2 Svg v1.0.19
   *  A low level canvas to SVG converter. Uses a mock canvas context to build an SVG document.
   *
   *  Licensed under the MIT license:
   *  http://www.opensource.org/licenses/mit-license.php
   *
   *  Author:
   *  Kerry Liu
   *
   *  Copyright (c) 2014 Gliffy Inc.
   */


HTMLWidgets.widget({
    name : "canvasXpress",
    type : "output",

    factory: function(el, width, height) {
        var c = document.createElement('canvas');
        c.id = el.id + '-cx';
        c.width = width;
        c.height = height;

        el.appendChild(c);

        return {
            id: c.id,
            renderValue: function(x) {
                try{CanvasXpress.destroy(c.id);}
                catch(err) {/*do nothing*/}
                if (!(x instanceof Array)) {
                    x.renderTo = c.id;
                    new CanvasXpress(x);
                }
            },
            resize: function(width, height) {
                cx = CanvasXpress.getObject(c.id);
                if (cx) {
                    cx.setDimensions(width, height);
                }
                else {
                    cx = CanvasXpress.getObject(c.id + '-1');
                    if (cx) {
                        cx.setDimensions(width, height);
                    }
                }
            }
        };
    }
});