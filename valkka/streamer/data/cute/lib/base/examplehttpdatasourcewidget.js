import { HTTPDataSourceWidget } from './httpdatasourcewidget.js';

class ExampleHTTPDataSourceWidget extends HTTPDataSourceWidget {
    
    
    declareDatamodels() {
        this.datamodel_create = { // C
            name: {
                label:  "First Name",
                help :  "The first name of the person",
                check:  this.checkStr.bind(this)
            },
            surname: {
                label:  "Last Name",
                help :  "The surname of the person",
                check:  this.checkStr.bind(this)
            },
            email: {
                label:  "Email",
                help :  "the email",
                check:  this.checkStr.bind(this)
            },
            age: {
                label: "Age",
                help : "Age of the person in years",
                check: this.checkNumber.bind(this)
            }
        };
        this.datamodel_read = this.datamodel_create // R
        this.datamodel_update = this.datamodel_create // U
    }

} // ExampleHTTPDataSourceWidget

export { ExampleHTTPDataSourceWidget }
