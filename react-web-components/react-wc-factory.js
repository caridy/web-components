window.ReactWCFactory = (function () {

    const attrNameToPropName = (name) => name.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    const propNameToAttrName = (name) => name.replace(/[A-Z]/g, (g) => '-' + g[1].toLowerCase());

    class ProxyReactComponent extends React.Component {
        constructor(props) {
            super();
            this.externalState = {};
            this.isRendered = false;
            props.registerCallback(this);
        }
        render() {
            this.isRendered = true;
            const { state, props: { Ctor, listeners } } = this;
            return React.createElement(
                Ctor,
                Object.assign({}, state, listeners)
            );
        }
    }

    function inferReactComponentDef(Ctor) {
        return {
            observedAttributes: { label: 1 },
            publicProperties: {
                label: 1,
                items: 1,
            },
            publicEvents: {
                added: "onAdded"
            },
            publicMethods: {},
        };
    }

    return (Ctor) => {

        const def = inferReactComponentDef(Ctor);
        const InternalSlot = Symbol();

        function dispatchEvent(wc, eventName, detail) {
            if (detail.length < 2) {
                detail = detail[0]; // if the payload is a single argument, use is directly.
            }
            const event = new CustomEvent(eventName, {
                bubbles: true,
                cancelable: true,
                detail,
            });
            wc.dispatchEvent(event);
        }

        function register(wc, rc) {
            wc[InternalSlot] = rc;
        }

        function getter(wc, propName) {
            return wc[InternalSlot][propName];
        }

        function setter(wc, propName, newValue) {
            const rc = wc[InternalSlot];
            const oldValue = rc.externalState[propName];
            if (newValue !== oldValue) {
                rc.externalState[propName] = newValue;
                const attrName = propNameToAttrName(propName);
                if (def.observedAttributes[attrName]) {
                    wc.setAttribute(attrName, newValue);
                }
                if (rc.isRendered) {
                    rc.setState(rc.externalState);
                }
            }
        }

        function callPublicMethod(wc, publicMethod, args) {
            const rc = wc[InternalSlot];
            return rc[publicMethod](...args);
        }

        class WebComponentDefinition extends HTMLElement {

            constructor() {
                super();
                const shadow = this.attachShadow({mode: 'open'});
                const listeners = Object.keys(def.publicEvents).reduce((events, eventName) => {
                    const propName = def.publicEvents[eventName];
                    events[propName] = (...args) => dispatchEvent(this, eventName, args);
                    return events;
                }, {});
                Object.defineProperties(this, Object.keys(def.publicProperties).reduce((props, propName) => {
                    props[propName] = {
                        get: () => getter(this, propName),
                        set: (newValue) => setter(this, propName, newValue),
                        enumerable: true,
                        configurable: false,
                    };
                    return props;
                }, {}));
                Object.defineProperties(this, Object.keys(def.publicMethods).reduce((methods, methodName) => {
                    methods[methodName] = {
                        value: (...args) => callPublicMethod(this, methodName, args),
                        enumerable: false,
                        configurable: false,
                    };
                    return methods;
                }, {}));
                ReactDOM.render(React.createElement(ProxyReactComponent, {
                    Ctor,
                    listeners,
                    registerCallback: (rc) => register(this, rc),
                }), shadow);
            }

            attributeChangedCallback(attrName, oldValue, newValue) {
                const propName = attrNameToPropName(attrName);
                // reflecting attributes to public props
                if (def.publicProperties[propName] && this[propName] !== newValue) {
                    this[propName] = newValue;
                }
            }

        }

        WebComponentDefinition.observedAttributes = Object.keys(def.observedAttributes);

        return WebComponentDefinition;
    };

})();
