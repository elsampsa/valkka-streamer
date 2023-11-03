import { DataSourceWidget } from './datasourcewidget.js';

// An example how you can subclass DataSourceWidget
// in order to create a mock data source

class MockDataSourceWidget extends DataSourceWidget {
    
    createState() {
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
        this.data = [
            {
                "uuid": "123456",
                "name": "John",
                "surname": "Doe",
                "email": "john.doe@gmail.com",
                "age": 51
            },
            {
                "uuid": "654321",
                "name": "Joanna",
                "surname": "Doe",
                "email": "joanna.doe@gmail.com",
                "age": 18
            }
        ];
    }

} // MockDataSourceWidget

export { MockDataSourceWidget }
