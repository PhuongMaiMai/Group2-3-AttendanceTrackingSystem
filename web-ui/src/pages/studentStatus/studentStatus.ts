import {Component, ViewChild} from '@angular/core';
import {NavController, NavParams, Nav} from 'ionic-angular';
import {RestAPI} from "../../providers/rest-api";
import Constants from '../../assets/Constants.json';

@Component({
  selector: 'page-studentStatus',
  templateUrl: 'studentStatus.html'
})
export class StudentStatusPage {
  @ViewChild(Nav) nav: Nav;
  user: {
    id: number,
    email: string,
    name: string,
    password: string,
    type: string
  };
  group: {
    id: number,
    number: string,
    instructor: {
      id: number,
      email: string,
      name: string,
      password: string,
      type: string
    },
    sessions: Array <{
      id: number,
      startTime: string,
      endTime: string,
      place: string
    }>,
    students: Array<{
      id: number,
      email: string,
      name: string,
      password: string,
      type: string
    }>,
    attendances: Array<{
      studentId: number,
      sessionId: number,
      timestamp: string
    }>
  };
  students: Array<{
    id: number,
    email: string,
    name: string,
    password: string,
    type: string,
    missingAttendances: number
  }>;
  CONSTANTS: any = Constants;

  constructor(public navCtrl: NavController, public navParams: NavParams,
              private restAPI: RestAPI) {

    this.user = this.navParams.get('user');

    this.group = this.navParams.get('group');

    this.restAPI.get('groups/'+ this.group.id + '/students').subscribe((response) => {
      if(Array.isArray(response)) {
        this.students = response;
        for(let i = 0; i < this.students.length; i++) {
          this.addMissingAttendances(this.students[i]);
        }
      }
    });
  }

  /**
   * gets the attendances of a student and compares them with the held sessions of the current group
   * @param student - user object from the server
   * @return number - of missing attendances
   */
  addMissingAttendances(student){
    this.restAPI.get('users/'+ student.id + '/attendances').subscribe((response) => {
      if(Array.isArray(response)) {
        if(this.group.sessions) {
          student.missingAttendances = this.group.sessions.length - response.length;
        }
      }
    });
  }

}
