import {Component} from '@angular/core';
import {MenuController, ModalController, NavController} from 'ionic-angular';
import {DetailsView} from '../detail/detail';
import {RegistrationsApi} from "../../providers/registrations-api";
import Constants from '../../assets/Constants.json';
import {QRCodeModal} from "../../helpers/qr-code-modal/qr-code";
import {LoginPage} from "../login/login";

@Component({
  selector: 'page-home',
  templateUrl: 'home.html'
})
export class HomePage {

  registeredGroups: object;
  CONSTANTS: any = Constants;

  constructor(public navCtrl: NavController,
              public modalCtrl: ModalController,
              public menuCtrl: MenuController,
              private registrationsAPI: RegistrationsApi) {
    //TODO: get lecture info
    /*this.registrationsAPI.getData().subscribe((registrations) => {
      this.registeredGroups = registrations;
      for(let key in this.registeredGroups) {
        if(this.registeredGroups.hasOwnProperty(key)) {
          this.registeredGroups = this.registeredGroups[key];
          break;
        }
      }
    });*/
  }

  itemSelected() {
    this.navCtrl.push(DetailsView, {
      item: {}
    });
  }

  getNextQRCode() {
    let qrCodeModal = this.modalCtrl.create(QRCodeModal, {value: "Hello"});
    qrCodeModal.present();
  }
}