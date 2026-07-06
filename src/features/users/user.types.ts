export interface User {

    id:string;

    fullName:string;

    email:string;

    role:"SUPER_ADMIN"|"ADMIN"|"AGENT";

    phone?:string;

    avatar?:string;

    isActive:boolean;

    createdAt:string;

}